"""ORM rows and request models to DTOs and repository inputs."""

from angel.ingestion.images import thumbnail_key
from angel.models import Order, OrderEvent, OrderItem, Product
from angel.repositories.products import SearchFilters
from angel.schemas.address import AddressSnapshot
from angel.schemas.admin import (
    AdminOrderEventOut,
    AdminOrderOut,
    AdminOrderSummary,
    AdminPaymentOut,
    AdminProductOut,
)
from angel.schemas.order import OrderEventOut, OrderItemOut, OrderOut, OrderSummary
from angel.schemas.product import FilterParams, ProductImage, ProductOut
from angel.storage import Storage


def product_image(image_key: str, blur_data_url: str | None, storage: Storage) -> ProductImage:
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
        image=product_image(product.image_key, product.blur_data_url, storage),
        rating_average=float(product.rating_average) if product.rating_count else None,
        rating_count=product.rating_count,
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
        image=product_image(product.image_key, product.blur_data_url, storage),
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
        image=product_image(item.image_key, None, storage),
        size=item.size,
        unit_price_cents=item.unit_price_cents,
        quantity=item.quantity,
        line_total_cents=item.unit_price_cents * item.quantity,
    )


PUBLIC_EVENT_TYPES = ("placed", "paid", "shipped", "delivered", "cancelled", "refunded")
_PUBLIC_DATA = {"shipped": ("carrier", "tracking_number"), "cancelled": ("reason",)}


def _loaded_events(order: Order) -> list[OrderEvent]:
    """The history, when the order was loaded with it (checkout and listings do not)."""
    return list(order.__dict__.get("events", []))


def to_public_events(order: Order) -> list[OrderEventOut]:
    """What a customer may see: no notes, no names of staff, no internal detail."""
    return [
        OrderEventOut(
            type=event.type,
            at=event.created_at,
            data={k: event.data[k] for k in _PUBLIC_DATA.get(event.type, ()) if k in event.data},
        )
        for event in _loaded_events(order)
        if event.type in PUBLIC_EVENT_TYPES
    ]


def to_order_out(order: Order, storage: Storage) -> OrderOut:
    return OrderOut(
        shipped_at=order.shipped_at,
        delivered_at=order.delivered_at,
        refunded_at=order.refunded_at,
        carrier=order.carrier,
        tracking_number=order.tracking_number,
        events=to_public_events(order),
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
        images=[product_image(item.image_key, None, storage) for item in order.items[:4]],
    )


def to_admin_order_summary(order: Order) -> AdminOrderSummary:
    return AdminOrderSummary(
        number=order.number,
        status=order.status,
        created_at=order.created_at,
        currency=order.currency,
        total_cents=order.total_cents,
        item_count=sum(item.quantity for item in order.items),
        customer_email=order.contact_email,
        customer_name=order.shipping_address.get("full_name", ""),
        payment_status=order.payment.status if order.payment else None,
    )


def to_admin_order_out(order: Order, storage: Storage) -> AdminOrderOut:
    base = to_order_out(order, storage)
    payment = order.payment
    return AdminOrderOut(
        **base.model_dump(exclude={"events"}),
        events=[
            AdminOrderEventOut(type=e.type, at=e.created_at, data=e.data)
            for e in _loaded_events(order)
        ],
        user_id=order.user_id,
        cancel_reason=order.cancel_reason,
        cancelled_at=order.cancelled_at,
        payment=AdminPaymentOut(
            provider=payment.provider,
            provider_payment_id=payment.provider_payment_id,
            status=payment.status,
            amount_cents=payment.amount_cents,
            currency=payment.currency,
            last_error=payment.last_error,
            refund_id=payment.refund_id,
        )
        if payment
        else None,
    )
