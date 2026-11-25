"""Худалдан авагчид "цөөхөн үлдсэн" гэж зөвхөн тоог нууж харуулна."""

import pytest

from tests.conftest import ApiFactory
from tests.support.commerce import set_product

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


@pytest.mark.parametrize(
    ("stock", "in_stock", "low_stock"),
    [(0, False, False), (1, True, True), (5, True, True), (6, True, False), (200, True, False)],
)
async def test_the_product_says_when_only_a_few_are_left(
    api_factory: ApiFactory, stock: int, in_stock: bool, low_stock: bool
) -> None:
    async with api_factory(seed_count=3) as api:
        product = api.entries[0]
        await set_product(api.app.state.engine, product.product_id, stock_quantity=stock)

        body = (await api.client.get(f"/api/v1/products/{product.product_id}")).json()

        assert (body["in_stock"], body["low_stock"]) == (in_stock, low_stock)
        assert "stock_quantity" not in body  # яг тоог нууна
