from angel.core.config import Settings
from angel.core.mongolia import is_capital
from angel.schemas.commerce.order import (
    ShippingMethodId,
    ShippingMethodList,
    ShippingMethodOut,
    ShippingZone,
)


class ShippingUnavailableError(ValueError):
    """Сонгосон хүргэлтийн төрөл энэ хаягийн бүсэд байхгүй (жишээ нь орон нутагт шуурхай)."""


def zone_for(region: str | None) -> ShippingZone:
    """Нийслэл бол `ub`, аймаг бол `rural`."""
    return "ub" if is_capital(region) else "rural"


def _standard_price(settings: Settings, zone: ShippingZone) -> int:
    return (
        settings.shipping_standard_ub_cents
        if zone == "ub"
        else settings.shipping_standard_rural_cents
    )


def available_methods(zone: ShippingZone) -> tuple[ShippingMethodId, ...]:
    return ("standard", "express", "pickup") if zone == "ub" else ("standard", "pickup")


def shipping_cost(
    settings: Settings, method: ShippingMethodId, subtotal_cents: int, zone: ShippingZone
) -> int:
    """Захиалгын хүргэлтийн төлбөр. Бүсэд байхгүй төрөл бол `ShippingUnavailableError`."""
    if method not in available_methods(zone):
        raise ShippingUnavailableError(method)
    if method == "pickup":
        return 0
    if method == "express":
        return settings.shipping_express_ub_cents
    if subtotal_cents >= settings.free_shipping_threshold_cents:
        return 0
    return _standard_price(settings, zone)


def shipping_methods(settings: Settings, zone: ShippingZone = "ub") -> ShippingMethodList:
    labels: dict[ShippingMethodId, tuple[str, str, str]] = {
        "standard": (
            "Энгийн хүргэлт",
            "Улаанбаатар хотод гэрт нь хүргэнэ"
            if zone == "ub"
            else "Орон нутгийн тээврийн компаниар хүргэнэ",
            "1-2 ажлын өдөр" if zone == "ub" else "2-5 ажлын өдөр",
        ),
        "express": ("Шуурхай хүргэлт", "Улаанбаатарт өдөртөө", "Өдөртөө"),
        "pickup": ("Дэлгүүрээс авах", settings.pickup_address, "Захиалга бэлэн болмогц"),
    }
    prices: dict[ShippingMethodId, int] = {
        "standard": _standard_price(settings, zone),
        "express": settings.shipping_express_ub_cents,
        "pickup": 0,
    }
    return ShippingMethodList(
        items=[
            ShippingMethodOut(
                id=method,
                label=labels[method][0],
                description=labels[method][1],
                price_cents=prices[method],
                estimated_days=labels[method][2],
            )
            for method in available_methods(zone)
        ],
        currency=settings.currency,
        free_shipping_threshold_cents=settings.free_shipping_threshold_cents,
    )
