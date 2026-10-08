from typing import ClassVar

import pytest

from lookalike.core.config import Settings
from lookalike.models import Product
from lookalike.services.shipping import shipping_cost, shipping_methods
from lookalike.services.sizes import sizes_for


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
    ("method", "subtotal", "expected"),
    [
        ("standard", 0, 499),
        ("standard", 9_999, 499),
        ("standard", 10_000, 0),  # free from the threshold
        ("standard", 250_000, 0),
        ("express", 0, 1299),
        ("express", 250_000, 1299),  # express is never free
    ],
)
def test_shipping_cost(method: str, subtotal: int, expected: int) -> None:
    assert shipping_cost(Settings(), method, subtotal) == expected  # type: ignore[arg-type]


def test_shipping_methods_use_the_configured_prices() -> None:
    settings = Settings(shipping_standard_cents=700, shipping_express_cents=2000)

    listed = shipping_methods(settings)

    assert [(m.id, m.price_cents) for m in listed.items] == [("standard", 700), ("express", 2000)]
    assert listed.currency == "USD"


class TestProductionSettings:
    PROD: ClassVar[dict[str, object]] = {
        "app_env": "prod",
        "jwt_secret": "x" * 40,
        "payments_mode": "stripe",
        "stripe_secret_key": "sk_test_x",
        "stripe_webhook_secret": "whsec_x",
    }

    def test_a_complete_production_config_is_accepted_and_forces_secure_cookies(self) -> None:
        settings = Settings(**self.PROD)  # type: ignore[arg-type]

        assert settings.cookie_secure is True

    @pytest.mark.parametrize(
        ("override", "message"),
        [
            ({"jwt_secret": ""}, "JWT_SECRET is required"),
            ({"payments_mode": "offline"}, "not allowed when APP_ENV=prod"),
            ({"stripe_secret_key": ""}, "STRIPE_SECRET_KEY"),
            ({"stripe_webhook_secret": ""}, "STRIPE_SECRET_KEY"),
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
