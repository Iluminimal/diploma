import pytest
from httpx import AsyncClient

from tests.conftest import Api
from tests.support.catalogue import GENDERS, TYPES

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

NAV = "/api/v1/catalog/nav"
PRODUCTS = "/api/v1/products"
SEEDED = range(1, 41)


def seeded(*, genders: tuple[str, ...] = GENDERS, article: str | None = None) -> int:
    """How many of the 40 seeded products match (gender and article type cycle with n)."""
    return sum(
        1
        for n in SEEDED
        if GENDERS[n % len(GENDERS)] in genders
        and (article is None or TYPES[n % len(TYPES)][2] == article)
    )


async def total(client: AsyncClient, **params: str) -> int:
    response = await client.get(PRODUCTS, params={**params, "page_size": 1})
    assert response.status_code == 200, response.text
    total: int = response.json()["total"]
    return total


async def test_the_nav_lists_women_and_men_with_counts_and_readable_names(api: Api) -> None:
    response = await api.client.get(NAV)

    body = response.json()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=300"
    # The seed has no Boys or Girls, so there is no Kids department.
    assert [d["slug"] for d in body["departments"]] == ["women", "men"]
    men = body["departments"][1]
    assert men["product_count"] == seeded(genders=("Men", "Unisex"))
    assert [g["name"] for g in men["groups"]] == ["Clothing", "Footwear"]
    topwear = men["groups"][0]["children"][0]
    assert topwear["path"] == "apparel/topwear"
    tshirts = next(c for c in topwear["children"] if c["slug"] == "tshirts")
    assert tshirts["name"] == "T-shirts"
    assert tshirts["product_count"] == seeded(genders=("Men", "Unisex"), article="Tshirts")


async def test_a_department_lists_its_genders_including_unisex(api: Api) -> None:
    assert await total(api.client, department="women") == seeded(genders=("Women", "Unisex"))
    assert await total(api.client, department="men") == seeded(genders=("Men", "Unisex"))
    assert await total(api.client, department="kids") == 0


async def test_a_category_path_lists_everything_beneath_it(api: Api) -> None:
    assert await total(api.client, category="apparel") == seeded() - seeded(article="Casual Shoes")
    assert await total(api.client, category="apparel/topwear") == seeded(article="Shirts") + seeded(
        article="Tshirts"
    )
    assert await total(api.client, category="apparel/topwear/tshirts") == seeded(article="Tshirts")


async def test_department_category_and_other_filters_narrow_each_other(api: Api) -> None:
    both = await total(api.client, department="men", category="apparel/topwear/tshirts")
    assert both == seeded(genders=("Men", "Unisex"), article="Tshirts")

    only_men = await total(
        api.client, department="men", category="apparel/topwear/tshirts", gender="Men"
    )
    assert only_men == seeded(genders=("Men",), article="Tshirts")


async def test_a_department_that_excludes_the_chosen_gender_is_simply_empty(api: Api) -> None:
    assert await total(api.client, department="kids", gender="Men") == 0


@pytest.mark.parametrize(
    "params", [{"department": "pets"}, {"category": "apparel/hats"}, {"category": "apparel/x/y"}]
)
async def test_unknown_departments_and_categories_are_404_problems(
    api: Api, params: dict[str, str]
) -> None:
    response = await api.client.get(PRODUCTS, params=params)

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["type"].endswith("category-not-found")
