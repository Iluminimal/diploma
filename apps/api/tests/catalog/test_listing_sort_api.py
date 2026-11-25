"""Шинэ эрэмбүүд (үнэлгээ, алдартай) ба үсгийн алдаатай хайлт."""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.admin.test_admin_orders_api import in_stock, place_order
from tests.conftest import Api
from tests.support.commerce import set_product

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

PRODUCTS = "/api/v1/products"


async def ids(api: Api, **params: str | int) -> list[int]:
    response = await api.client.get(PRODUCTS, params={"page_size": 60, **params})
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


async def test_best_rated_comes_first_then_more_reviews_then_id(
    api: Api, db_engine: AsyncEngine
) -> None:
    first, second, third, fourth = (e.product_id for e in api.entries[:4])
    await set_product(db_engine, first, rating_average=4.5, rating_count=2)
    await set_product(db_engine, second, rating_average=4.5, rating_count=9)
    await set_product(db_engine, third, rating_average=5, rating_count=1)
    await set_product(db_engine, fourth, rating_average=3, rating_count=50)

    ordered = await ids(api, sort="rating")

    assert ordered[:4] == [third, second, first, fourth]
    assert len(ordered) == len(set(ordered)) == 40


async def test_the_most_sold_comes_first_and_only_paid_orders_count(
    api: Api,
) -> None:
    best, second, unpaid = (in_stock(api, n) for n in range(3))
    await place_order(api, best, pay=True)
    await place_order(api, best, pay=True)
    await place_order(api, second, pay=True)
    await place_order(api, unpaid, pay=False)

    ordered = await ids(api, sort="popular")

    assert ordered[:2] == [best.product_id, second.product_id]
    assert ordered.index(unpaid.product_id) > 1
    assert len(ordered) == len(set(ordered)) == 40


async def test_popular_with_no_sales_falls_back_to_newest_first(api: Api) -> None:
    assert await ids(api, sort="popular") == await ids(api, sort="newest")


async def test_a_misspelled_word_still_finds_the_product_and_says_so(api: Api) -> None:
    response = await api.client.get(PRODUCTS, params={"q": "Shirst", "page_size": 60})

    body = response.json()
    assert response.status_code == 200
    assert body["fuzzy"] is True
    assert body["total"] > 0
    assert all("Shirts" in item["name"] for item in body["items"])


async def test_an_exact_match_is_not_marked_fuzzy(api: Api) -> None:
    body = (await api.client.get(PRODUCTS, params={"q": "Jeans"})).json()

    assert body["total"] > 0
    assert body["fuzzy"] is False


async def test_nonsense_finds_nothing_and_is_not_fuzzy(api: Api) -> None:
    body = (await api.client.get(PRODUCTS, params={"q": "qqqzzzxxx"})).json()

    assert (body["total"], body["items"], body["fuzzy"]) == (0, [], False)


async def test_fuzzy_results_respect_the_filters(api: Api) -> None:
    body = (await api.client.get(PRODUCTS, params={"q": "Shirst", "gender": "Men"})).json()

    men = {e.product_id for e in api.entries if e.gender == "Men"}
    assert body["fuzzy"] is True
    assert body["items"]
    assert {item["id"] for item in body["items"]} <= men


async def test_fuzzy_results_can_be_sorted_and_paged(api: Api) -> None:
    cheap = (
        await api.client.get(PRODUCTS, params={"q": "Shirst", "sort": "price_asc", "page_size": 5})
    ).json()
    page_two = (
        await api.client.get(
            PRODUCTS, params={"q": "Shirst", "sort": "price_asc", "page_size": 5, "page": 2}
        )
    ).json()

    prices = [item["price_cents"] for item in cheap["items"]]
    assert prices == sorted(prices)
    assert page_two["fuzzy"] is True
    assert {i["id"] for i in cheap["items"]}.isdisjoint({i["id"] for i in page_two["items"]})


async def test_arbitrary_text_does_not_break_the_fuzzy_fallback(api: Api) -> None:
    for query in ["'; DROP TABLE products; --", "%%%", "\\", "a" * 200]:
        response = await api.client.get(PRODUCTS, params={"q": query})
        assert response.status_code == 200, query

    assert (await api.client.get(PRODUCTS)).json()["total"] == 40
