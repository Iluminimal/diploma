import asyncio
import math
import secrets
import uuid
from dataclasses import dataclass
from http import HTTPStatus

import numpy as np
from numpy.typing import NDArray
from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.core.errors import INVALID_CATEGORY_TYPE, PRODUCT_NOT_FOUND_TYPE, ProblemError
from lookalike.core.logging import get_logger
from lookalike.core.slug import slugify
from lookalike.core.uploads import ALLOWED_FORMATS, invalid_image
from lookalike.ingestion.images import (
    THUMBNAIL_SIZES,
    Thumbnails,
    build_thumbnails,
    thumbnail_key,
)
from lookalike.ml.embeddings import EmbeddingService
from lookalike.ml.preprocess import InvalidImageError, load_image
from lookalike.models import Product
from lookalike.repositories.categories import CategoryRepository, LeafCategory
from lookalike.repositories.products import ProductRepository
from lookalike.schemas.admin import (
    AdminCategory,
    AdminProductListQuery,
    AdminProductOut,
    AdminProductPage,
    AdminProductUpdate,
    ProductFields,
)
from lookalike.services.cache import SearchCache
from lookalike.services.mappers import to_admin_product_out
from lookalike.storage import Storage

log = get_logger(__name__)

# Photos of products made here live apart from the dataset's `products/NNN/<id>` keys.
ADMIN_IMAGE_PREFIX = "products/admin/"
# Same decode size as the search pipeline and ingestion, so the stored vector is comparable.
DECODE_MIN_SIDE = 800


@dataclass(frozen=True)
class PreparedImage:
    thumbnails: Thumbnails
    embedding: NDArray[np.float32]


def _not_found(product_id: int) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND,
        "Product not found",
        f"There is no product {product_id}.",
        type_=PRODUCT_NOT_FOUND_TYPE,
    )


class AdminProductService:
    def __init__(
        self,
        session: AsyncSession,
        storage: Storage,
        embedder: EmbeddingService,
        cache: SearchCache,
        *,
        currency: str,
        max_upload_pixels: int,
    ) -> None:
        self._session = session
        self._storage = storage
        self._embedder = embedder
        self._cache = cache
        self._currency = currency
        self._max_pixels = max_upload_pixels
        self._products = ProductRepository(session)
        self._categories = CategoryRepository(session)

    # --- reads -----------------------------------------------------------------------------

    async def categories(self) -> list[AdminCategory]:
        async with self._session.begin():
            leaves = await self._categories.leaf_categories()
        return [
            AdminCategory(
                id=c.id,
                path=c.path,
                master_category=c.master_category,
                sub_category=c.sub_category,
                article_type=c.article_type,
            )
            for c in leaves
        ]

    async def list_products(self, query: AdminProductListQuery) -> AdminProductPage:
        async with self._session.begin():
            products, total = await self._products.list_all(
                text_query=query.q,
                status=query.status,
                category_id=query.category_id,
                sort=query.sort,
                offset=(query.page - 1) * query.page_size,
                limit=query.page_size,
            )
        return AdminProductPage(
            items=[to_admin_product_out(p, self._storage) for p in products],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
        )

    async def get(self, product_id: int) -> AdminProductOut:
        async with self._session.begin():
            product = await self._products.get_any(product_id)
        if product is None:
            raise _not_found(product_id)
        return to_admin_product_out(product, self._storage)

    # --- writes ----------------------------------------------------------------------------

    async def create(
        self, data: bytes, fields: ProductFields, *, is_active: bool
    ) -> AdminProductOut:
        """A new product from its photo: thumbnails, blur placeholder and FashionCLIP embedding
        are computed from the upload, so it is immediately findable by visual search."""
        async with self._session.begin():
            category = await self._leaf(fields.category_id)
        prepared = await self._prepare(data)
        key = await self._store(prepared)
        try:
            async with self._session.begin():
                product = await self._products.add(
                    Product(
                        slug=f"{slugify(fields.name) or 'product'}-{secrets.token_hex(4)}",
                        name=fields.name,
                        category_id=category.id,
                        gender=fields.gender,
                        master_category=category.master_category,
                        sub_category=category.sub_category,
                        article_type=category.article_type,
                        base_colour=fields.base_colour,
                        season=fields.season,
                        usage=fields.usage,
                        year=fields.year,
                        price_cents=fields.price_cents,
                        currency=self._currency,
                        stock_quantity=fields.stock_quantity,
                        is_active=is_active,
                        image_key=key,
                        blur_data_url=prepared.thumbnails.blur_data_url,
                        embedding=prepared.embedding.tolist(),
                        embedding_version=self._embedder.version,
                    )
                )
        except Exception:
            await self._discard(key)
            raise
        await self._cache.invalidate_catalogue()
        log.info("admin_product_created", product_id=product.id)
        return to_admin_product_out(product, self._storage)

    async def update(self, product_id: int, changes: AdminProductUpdate) -> AdminProductOut:
        values = changes.model_dump(exclude_unset=True)
        if "category_id" in values and values["category_id"] is None:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Invalid category",
                "A product needs a category.",
                type_=INVALID_CATEGORY_TYPE,
            )
        for required in ("name", "gender", "price_cents", "stock_quantity"):
            if required in values and values[required] is None:
                raise ProblemError(
                    HTTPStatus.UNPROCESSABLE_ENTITY,
                    "Invalid value",
                    f"{required} cannot be cleared.",
                )
        async with self._session.begin():
            product = await self._products.get_any(product_id, for_update=True)
            if product is None:
                raise _not_found(product_id)
            if "category_id" in values:
                category = await self._leaf(values.pop("category_id"))
                product.category_id = category.id
                product.master_category = category.master_category
                product.sub_category = category.sub_category
                product.article_type = category.article_type
            for name, value in values.items():
                setattr(product, name, value)
            await self._products.save(product)
        await self._cache.invalidate_catalogue()
        return to_admin_product_out(product, self._storage)

    async def replace_image(self, product_id: int, data: bytes) -> AdminProductOut:
        """New photo, new embedding. The files get a new key so browsers and caches never keep
        showing the old picture."""
        async with self._session.begin():
            if await self._products.get_any(product_id) is None:
                raise _not_found(product_id)
        prepared = await self._prepare(data)
        key = await self._store(prepared)
        try:
            async with self._session.begin():
                product = await self._products.get_any(product_id, for_update=True)
                if product is None:
                    raise _not_found(product_id)
                old_key = product.image_key
                product.image_key = key
                product.blur_data_url = prepared.thumbnails.blur_data_url
                product.embedding = prepared.embedding.tolist()
                product.embedding_version = self._embedder.version
                await self._products.save(product)
        except Exception:
            await self._discard(key)
            raise
        if old_key.startswith(ADMIN_IMAGE_PREFIX):
            await self._discard(old_key)
        await self._cache.invalidate_catalogue()
        return to_admin_product_out(product, self._storage)

    async def set_active(self, product_id: int, *, active: bool) -> AdminProductOut:
        """Withdraw or restore a product. Products are never deleted: orders refer to them."""
        async with self._session.begin():
            product = await self._products.get_any(product_id, for_update=True)
            if product is None:
                raise _not_found(product_id)
            if product.is_active != active:
                product.is_active = active
                await self._products.save(product)
        await self._cache.invalidate_catalogue()
        log.info("admin_product_active_changed", product_id=product_id, active=active)
        return to_admin_product_out(product, self._storage)

    # --- steps -----------------------------------------------------------------------------

    async def _leaf(self, category_id: int) -> LeafCategory:
        leaves = await self._categories.leaf_categories(category_id)
        if not leaves:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Invalid category",
                f"Category {category_id} does not exist or is not an article type.",
                type_=INVALID_CATEGORY_TYPE,
            )
        return leaves[0]

    async def _prepare(self, data: bytes) -> PreparedImage:
        try:
            image = await asyncio.to_thread(
                load_image,
                data,
                min_side=DECODE_MIN_SIDE,
                formats=ALLOWED_FORMATS,
                max_pixels=self._max_pixels,
            )
        except InvalidImageError as exc:
            log.info("upload_rejected", reason=str(exc)[:200])
            raise invalid_image(
                "The file is not a valid JPEG, PNG or WebP image, or its dimensions are too large."
            ) from exc
        thumbnails = await asyncio.to_thread(build_thumbnails, image)
        embedding = (await self._embedder.aembed_images([image]))[0]
        return PreparedImage(thumbnails, embedding)

    async def _store(self, prepared: PreparedImage) -> str:
        key = f"{ADMIN_IMAGE_PREFIX}{uuid.uuid4().hex}"
        try:
            for size, webp in prepared.thumbnails.webp.items():
                await asyncio.to_thread(self._storage.put, thumbnail_key(key, size), webp)
        except Exception:
            await self._discard(key)
            raise
        return key

    async def _discard(self, key: str) -> None:
        """Remove the files of an image that did not make it into the database."""
        for size in THUMBNAIL_SIZES:
            try:
                await asyncio.to_thread(self._storage.delete, thumbnail_key(key, size))
            except Exception as exc:  # cleanup must not hide the error that caused it
                log.warning("image_cleanup_failed", key=key, error=type(exc).__name__)
