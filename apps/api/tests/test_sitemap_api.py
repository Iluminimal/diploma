from itertools import chain

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Api, ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

SITEMAP = "/api/v1/catalog/sitemap"


async def ids(client: AsyncClient, **params: int) -> list[int]:
    response = await client.get(SITEMAP, params=params)
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


async def test_the_sitemap_lists_active_products_in_id_order(api: Api) -> None:
    response = await api.client.get(SITEMAP)

    body = response.json()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=300"
    assert [item["id"] for item in body["items"]] == list(range(1, 41))
    assert (body["total"], body["page"], body["pages"]) == (40, 1, 1)
    first = body["items"][0]
    assert set(first) == {"id", "slug", "updated_at"}
    assert first["slug"]


async def test_the_sitemap_pages_without_gaps_or_overlap(api: Api) -> None:
    pages = [await ids(api.client, page=n, page_size=15) for n in (1, 2, 3, 4)]

    assert [len(p) for p in pages] == [15, 15, 10, 0]
    assert list(chain.from_iterable(pages)) == list(range(1, 41))
    assert (await api.client.get(SITEMAP, params={"page_size": 15})).json()["pages"] == 3


async def test_withdrawn_products_leave_the_sitemap(api: Api, db_engine: AsyncEngine) -> None:
    async with db_engine.begin() as connection:
        await connection.execute(text("UPDATE products SET is_active = false WHERE id IN (3, 4)"))

    listed = await ids(api.client, page_size=100)

    assert 3 not in listed
    assert 4 not in listed
    assert len(listed) == 38
    total = (await api.client.get(SITEMAP)).json()["total"]
    assert total == 38


@pytest.mark.parametrize(
    "params", [{"page": 0}, {"page_size": 0}, {"page_size": 10_001}, {"page": 10_001}]
)
async def test_the_sitemap_validates_its_paging(api: Api, params: dict[str, int]) -> None:
    assert (await api.client.get(SITEMAP, params=params)).status_code == 422


async def test_an_empty_catalogue_gives_an_empty_sitemap(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        body = (await api.client.get(SITEMAP)).json()

    assert body == {"items": [], "total": 0, "page": 1, "page_size": 5000, "pages": 0}
