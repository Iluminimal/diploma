from typing import ClassVar

import pytest

from angel.core.config import Settings
from angel.models import Product
from angel.services.catalog.sizes import sizes_for
from angel.services.commerce.shipping import (
    ShippingUnavailableError,
    shipping_cost,
    shipping_methods,
    zone_for,
)


def product(**kwargs: str) -> Product:
    base = {"gender": "Men", "master_category": "Apparel", "sub_category": "Topwear"}
    return Product(**{**base, **kwargs})


def test_sizes_follow_the_category_like_the_web_app() -> None:
    assert sizes_for(product()) == ("XS", "S", "M", "L", "XL", "XXL")
    assert sizes_for(product(gender="Girls"))[0] == "2-3Y"
    assert sizes_for(product(master_category="Footwear", sub_category="Shoes")) == (
        "6", "7", "8", "9", "10", "11",
    )  # fmt: skip
    assert sizes_for(product(master_category="Footwear", gender="Boys"))[0] == "10C"
    assert sizes_for(product(master_category="Accessories", sub_category="Belts")) == (
        "S",
        "M",
        "L",
    )
    assert sizes_for(product(master_category="Accessories", sub_category="Watches")) == ()
    assert sizes_for(product(master_category="Personal Care", sub_category="Fragrance")) == ()


@pytest.mark.parametrize(
    ("method", "subtotal", "zone", "expected"),
    [
        ("standard", 0, "ub", 500_000),
        ("standard", 14_999_999, "ub", 500_000),
        ("standard", 15_000_000, "ub", 0),  # босгоос эхлэн үнэгүй
        ("standard", 0, "rural", 1_000_000),
        ("standard", 15_000_000, "rural", 0),
        ("express", 0, "ub", 1_200_000),
        ("express", 25_000_000, "ub", 1_200_000),  # express хэзээ ч үнэгүй биш
        ("pickup", 0, "ub", 0),
        ("pickup", 0, "rural", 0),
    ],
)
def test_shipping_cost(method: str, subtotal: int, zone: str, expected: int) -> None:
    cost = shipping_cost(Settings(_env_file=None), method, subtotal, zone)  # type: ignore[arg-type]
    assert cost == expected


def test_express_does_not_exist_outside_ulaanbaatar() -> None:
    with pytest.raises(ShippingUnavailableError):
        shipping_cost(Settings(_env_file=None), "express", 0, "rural")


def test_the_zone_follows_the_region() -> None:
    assert zone_for("Улаанбаатар") == "ub"
    assert zone_for("Дархан-Уул") == "rural"
    assert zone_for(None) == "rural"


def test_shipping_methods_use_the_configured_prices() -> None:
    settings = Settings(
        _env_file=None, shipping_standard_ub_cents=700, shipping_express_ub_cents=2000
    )

    listed = shipping_methods(settings)

    assert [(m.id, m.price_cents) for m in listed.items] == [
        ("standard", 700),
        ("express", 2000),
        ("pickup", 0),
    ]
    assert listed.currency == "MNT"
    assert [m.id for m in shipping_methods(settings, "rural").items] == ["standard", "pickup"]


class TestProductionSettings:
    PROD: ClassVar[dict[str, object]] = {
        "app_env": "prod",
        "jwt_secret": "x" * 40,
        # .env дээр fake Google байж болно; prod-ыг өөрийнх нь тохиргоогоор шалгана.
        "oauth_mode": "google",
        "payments_mode": "qpay",
        "qpay_base_url": "https://merchant.qpay.mn",
        "qpay_client_id": "ANGEL",
        "qpay_client_secret": "secret",
        "qpay_invoice_code": "ANGEL_INVOICE",
        # .env дээр console SMS, тогтмол код байж болно; prod-ыг өөрийнх нь тохиргоогоор шалгана.
        "sms_mode": "twilio",
        "otp_dev_code": "",
        "twilio_account_sid": "AC1",
        "twilio_auth_token": "token",
        "twilio_from_number": "+15005550006",
        # .env дээр console имэйл байж болно; prod-ыг өөрийнх нь тохиргоогоор шалгана.
        "mail_mode": "smtp",
        "smtp_host": "smtp.example.com",
        "mail_from": "Angel <no-reply@example.com>",
    }

    def test_a_complete_production_config_is_accepted_and_forces_secure_cookies(self) -> None:
        settings = Settings(**self.PROD)  # type: ignore[arg-type]

        assert settings.cookie_secure is True

    @pytest.mark.parametrize(
        ("override", "message"),
        [
            ({"jwt_secret": ""}, "JWT_SECRET is required"),
            ({"payments_mode": "offline"}, "not allowed when APP_ENV=prod"),
            ({"qpay_client_secret": ""}, "QPAY_CLIENT_ID"),
            ({"qpay_invoice_code": ""}, "QPAY_CLIENT_ID"),
            ({"qpay_base_url": "https://merchant-sandbox.qpay.mn"}, "sandbox"),
            ({"otp_dev_code": "000000"}, "OTP_DEV_CODE"),
            ({"sms_mode": "console"}, "SMS_MODE=console"),
            ({"twilio_auth_token": ""}, "TWILIO_ACCOUNT_SID"),
            ({"mail_mode": "console"}, "MAIL_MODE=console"),
            ({"smtp_host": ""}, "SMTP_HOST and MAIL_FROM"),
        ],
    )
    def test_unsafe_production_configs_refuse_to_start(
        self, override: dict[str, str], message: str
    ) -> None:
        with pytest.raises(ValueError, match=message):
            Settings(**{**self.PROD, **override})  # type: ignore[arg-type]

    def test_a_short_jwt_secret_is_rejected_everywhere(self) -> None:
        with pytest.raises(ValueError, match="at least 32"):
            Settings(app_env="dev", jwt_secret="short")

    def test_development_needs_no_secrets(self) -> None:
        settings = Settings(app_env="dev", jwt_secret="", payments_mode="offline")

        assert settings.cookie_secure is False


def test_every_shipping_price_is_whole_tugrik_so_qpay_is_charged_exactly_what_is_shown() -> None:
    """QPay-д дүн бүхэл төгрөгөөр (`minor // 100`) явна: үлдэгдэл байвал дүн зөрнө."""
    settings = Settings(_env_file=None)
    prices = [
        settings.shipping_standard_ub_cents,
        settings.shipping_standard_rural_cents,
        settings.shipping_express_ub_cents,
        settings.free_shipping_threshold_cents,
    ]
    assert all(price % 100 == 0 for price in prices)
    for zone in ("ub", "rural"):
        for method in ("standard", "express", "pickup"):
            if method == "express" and zone == "rural":
                continue
            assert shipping_cost(settings, method, 1_234_500, zone) % 100 == 0
