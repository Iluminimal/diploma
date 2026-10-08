"""ORM rows and request models to DTOs and repository inputs."""

from lookalike.ingestion.images import thumbnail_key
from lookalike.models import Order, OrderItem, Product
from lookalike.repositories.products import SearchFilters
from lookalike.schemas.address import AddressSnapshot
from lookalike.schemas.admin import AdminProductOut
from lookalike.schemas.order import OrderItemOut, OrderOut, OrderSummary
from lookalike.schemas.product import FilterParams, ProductImage, ProductOut
from lookalike.storage import Storage


def _image(image_key: str, blur_data_url: str | None, storage: Storage) -> ProductImage:
    return ProductImage(
        thumb_400=storage.url(thumbnail_key(image_key, 400)),
        thumb_800=storage.url(thumbnail_key(image_key, 800)),
        blur_data_url=blur_data_url,
    )


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
        image=_image(product.image_key, product.blur_data_url, storage),
    )


def to_admin_product_out(product: Product, storage: Storage) -> AdminProductOut:
    return AdminProductOut(
        id=product.id,
        slug=product.slug,
        name=product.name,
        category_id=product.category_id,
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
        stock_quantity=product.stock_quantity,
        is_active=product.is_active,
        source_id=product.source_id,
        embedding_version=product.embedding_version,
        image=_image(product.image_key, product.blur_data_url, storage),
        created_at=product.created_at,
        updated_at=product.updated_at,
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


def to_order_item_out(item: OrderItem, storage: Storage) -> OrderItemOut:
    return OrderItemOut(
        product_id=item.product_id,
        name=item.product_name,
        slug=item.product_slug,
        image=_image(item.image_key, None, storage),
        size=item.size,
        unit_price_cents=item.unit_price_cents,
        quantity=item.quantity,
        line_total_cents=item.unit_price_cents * item.quantity,
    )


def to_order_out(order: Order, storage: Storage) -> OrderOut:
    return OrderOut(
        number=order.number,
        status=order.status,
        created_at=order.created_at,
        paid_at=order.paid_at,
        currency=order.currency,
        subtotal_cents=order.subtotal_cents,
        shipping_cents=order.shipping_cents,
        total_cents=order.total_cents,
        shipping_method=order.shipping_method,
        shipping_address=AddressSnapshot.model_validate(order.shipping_address),
        contact_email=order.contact_email,
        items=[to_order_item_out(item, storage) for item in order.items],
    )


def to_order_summary(order: Order, storage: Storage) -> OrderSummary:
    return OrderSummary(
        number=order.number,
        status=order.status,
        created_at=order.created_at,
        currency=order.currency,
        total_cents=order.total_cents,
        item_count=sum(item.quantity for item in order.items),
        images=[_image(item.image_key, None, storage) for item in order.items[:4]],
    )
