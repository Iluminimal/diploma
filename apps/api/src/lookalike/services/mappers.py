"""ORM rows and request models to DTOs and repository inputs."""

from lookalike.ingestion.images import thumbnail_key
from lookalike.models import Product
from lookalike.repositories.products import SearchFilters
from lookalike.schemas.product import FilterParams, ProductImage, ProductOut
from lookalike.storage import Storage


def to_product_out(product: Product, storage: Storage) -> ProductOut:
    return ProductOut(
        id=product.id,
        slug=product.slug,
        name=product.name,
        gender=product.gender,
        master_category=product.master_category,
        sub_category=product.sub_category,
        article_type=product.article_type,
        base_colour=product.base_colour,
        season=product.season,
        usage=product.usage,
        year=product.year,
        price_cents=product.price_cents,
        currency=product.currency,
        in_stock=product.stock_quantity > 0,
        image=ProductImage(
            thumb_400=storage.url(thumbnail_key(product.image_key, 400)),
            thumb_800=storage.url(thumbnail_key(product.image_key, 800)),
            blur_data_url=product.blur_data_url,
        ),
    )


def to_search_filters(params: FilterParams) -> SearchFilters:
    return SearchFilters(
        genders=tuple(params.gender),
        master_categories=tuple(params.master_category),
        sub_categories=tuple(params.sub_category),
        article_types=tuple(params.article_type),
        base_colours=tuple(params.color),
        seasons=tuple(params.season),
        usages=tuple(params.usage),
        min_price_cents=params.min_price,
        max_price_cents=params.max_price,
        in_stock_only=params.in_stock,
    )
