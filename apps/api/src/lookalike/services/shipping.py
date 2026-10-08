from lookalike.core.config import Settings
from lookalike.schemas.order import ShippingMethodId, ShippingMethodList, ShippingMethodOut

_DESCRIPTIONS: dict[ShippingMethodId, tuple[str, str, str]] = {
    "standard": ("Standard shipping", "Tracked delivery", "3-5 business days"),
    "express": ("Express shipping", "Priority handling", "1-2 business days"),
}


def shipping_cost(settings: Settings, method: ShippingMethodId, subtotal_cents: int) -> int:
    if method == "express":
        return settings.shipping_express_cents
    if subtotal_cents >= settings.free_shipping_threshold_cents:
        return 0
    return settings.shipping_standard_cents


def shipping_methods(settings: Settings) -> ShippingMethodList:
    prices: dict[ShippingMethodId, int] = {
        "standard": settings.shipping_standard_cents,
        "express": settings.shipping_express_cents,
    }
    return ShippingMethodList(
        items=[
            ShippingMethodOut(
                id=method,
                label=label,
                description=description,
                price_cents=prices[method],
                estimated_days=days,
            )
            for method, (label, description, days) in _DESCRIPTIONS.items()
        ],
        currency=settings.currency,
        free_shipping_threshold_cents=settings.free_shipping_threshold_cents,
    )
