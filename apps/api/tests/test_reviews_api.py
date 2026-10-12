"""Product reviews: who may write one, the average that follows them, and moderation."""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from httpx import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.models import User
from angel.services.reviews import author_name
from tests.commerce import Shopper, register, set_product
from tests.conftest import Api, ApiFactory
from tests.fakes import RecordingGateway
from tests.test_admin_orders_api import administrator, in_stock, place_order

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin"


class Store:
    def __init__(self, api: Api, admin: Shopper, product_id: int) -> None:
        self.api, self.admin, self.product_id = api, admin, product_id

    @property
    def url(self) -> str:
        return f"/api/v1/products/{self.product_id}/reviews"

    async def buyer(self) -> Shopper:
        """A customer with a paid order for the product."""
        product = next(e for e in self.api.entries if e.product_id == self.product_id)
        shopper, _ = await place_order(self.api, product, pay=True)
        return shopper

    async def review(
        self, who: Shopper, rating: int = 5, product_id: int | None = None, **fields: Any
    ) -> Response:
        url = self.url if product_id is None else f"/api/v1/products/{product_id}/reviews"
        return await self.api.client.post(url, json={"rating": rating, **fields}, headers=who.auth)

    async def page(self, who: Shopper | None = None, **params: Any) -> dict[str, Any]:
        response = await self.api.client.get(
            self.url, params=params, headers=who.auth if who else None
        )
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    async def product(self) -> dict[str, Any]:
        response = await self.api.client.get(f"/api/v1/products/{self.product_id}")
        body: dict[str, Any] = response.json()
        return body

    async def moderate(self, review_id: int, action: str) -> Response:
        return await self.api.client.post(
            f"{ADMIN}/reviews/{review_id}/{action}", headers=self.admin.auth
        )


@pytest.fixture
async def store(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> AsyncIterator[Store]:
    async with api_factory(media_dir=tmp_path, gateway=RecordingGateway()) as api:
        product_id = in_stock(api, 0).product_id
        await set_product(db_engine, product_id, stock_quantity=1000)
        yield Store(api, await administrator(api, db_engine), product_id)


# --- who may review ---------------------------------------------------------------------------


async def test_a_buyer_can_review_and_it_shows_on_the_product(store: Store) -> None:
    buyer = await store.buyer()

    response = await store.review(buyer, 4, title="  Nice fit ", body="Runs a little large.")

    body = response.json()
    assert response.status_code == 201, response.text
    assert (body["rating"], body["title"], body["body"]) == (4, "Nice fit", "Runs a little large.")
    assert body["author"] == "Test S."
    assert body["status"] == "published"
    page = await store.page()
    assert [r["id"] for r in page["items"]] == [body["id"]]
    assert page["summary"] == {"average": 4.0, "count": 1, "distribution": [0, 0, 0, 1, 0]}
    assert "email" not in response.text


async def test_the_visitor_must_be_signed_in(store: Store) -> None:
    response = await store.api.client.post(store.url, json={"rating": 5})

    assert response.status_code == 401


async def test_someone_who_never_bought_it_cannot_review(store: Store) -> None:
    stranger = await register(store.api.client)

    response = await store.review(stranger)

    assert response.status_code == 403
    assert response.json()["type"] == "urn:angel:problem:review-not-allowed"
    assert (await store.page())["summary"]["count"] == 0


async def test_an_unpaid_order_does_not_count(store: Store) -> None:
    product = next(e for e in store.api.entries if e.product_id == store.product_id)
    unpaid, _ = await place_order(store.api, product, pay=False)

    assert (await store.review(unpaid)).status_code == 403


async def test_a_refunded_order_does_not_count(store: Store) -> None:
    product = next(e for e in store.api.entries if e.product_id == store.product_id)
    shopper, number = await place_order(store.api, product, pay=True)
    refund = await store.api.client.post(
        f"{ADMIN}/orders/{number}/refund",
        json={"reason": "x", "restock": False},
        headers=store.admin.auth,
    )
    assert refund.status_code == 200

    assert (await store.review(shopper)).status_code == 403


async def test_buying_one_product_does_not_let_you_review_another(store: Store) -> None:
    buyer = await store.buyer()
    other = in_stock(store.api, 1).product_id

    assert (await store.review(buyer, product_id=other)).status_code == 403


async def test_one_review_per_product(store: Store) -> None:
    buyer = await store.buyer()
    await store.review(buyer, 5)

    again = await store.review(buyer, 1)

    assert again.status_code == 409
    assert again.json()["type"] == "urn:angel:problem:review-exists"
    assert (await store.page())["summary"]["count"] == 1


async def test_unknown_and_withdrawn_products_have_no_reviews(
    store: Store, db_engine: AsyncEngine
) -> None:
    buyer = await store.buyer()
    missing = await store.api.client.get("/api/v1/products/999999/reviews")
    async with db_engine.begin() as connection:
        await connection.execute(
            text("UPDATE products SET is_active = false WHERE id = :i"), {"i": store.product_id}
        )

    withdrawn = await store.api.client.get(store.url)
    posted = await store.review(buyer)

    assert (missing.status_code, withdrawn.status_code, posted.status_code) == (404, 404, 404)


@pytest.mark.parametrize(
    "fields",
    [
        {"rating": 0},
        {"rating": 6},
        {"rating": 3.5},
        {"rating": "five"},
        {"rating": 5, "title": "x" * 121},
        {"rating": 5, "body": "x" * 2001},
        {"rating": 5, "status": "hidden"},
        {},
    ],
)
async def test_a_review_must_be_well_formed(store: Store, fields: dict[str, Any]) -> None:
    buyer = await store.buyer()

    response = await store.api.client.post(store.url, json=fields, headers=buyer.auth)

    assert response.status_code == 422
    assert (await store.page())["summary"]["count"] == 0


async def test_blank_text_is_stored_as_nothing(store: Store) -> None:
    buyer = await store.buyer()

    body = (await store.review(buyer, 3, title="   ", body="")).json()

    assert (body["title"], body["body"]) == (None, None)


# --- the average ------------------------------------------------------------------------------


async def test_the_average_count_and_distribution_follow_the_reviews(store: Store) -> None:
    ratings = [5, 2, 4, 4]
    for stars in ratings:
        await store.review(await store.buyer(), stars)

    page = await store.page()
    product = await store.product()

    assert page["summary"] == {"average": 3.75, "count": 4, "distribution": [0, 1, 0, 2, 1]}
    assert (product["rating_average"], product["rating_count"]) == (3.75, 4)


async def test_a_product_without_reviews_has_no_average(store: Store) -> None:
    product = await store.product()

    assert (product["rating_average"], product["rating_count"]) == (None, 0)
    assert (await store.page())["summary"] == {
        "average": None,
        "count": 0,
        "distribution": [0, 0, 0, 0, 0],
    }


async def test_reviews_posted_at_the_same_moment_are_all_counted(store: Store) -> None:
    buyers = [await store.buyer() for _ in range(4)]

    responses = await asyncio.gather(*(store.review(b, 1 + i) for i, b in enumerate(buyers)))

    assert [r.status_code for r in responses] == [201] * 4
    product = await store.product()
    assert (product["rating_average"], product["rating_count"]) == (2.5, 4)


async def test_reviews_can_be_sorted_and_paged(store: Store) -> None:
    for stars in (3, 5, 1):
        await store.review(await store.buyer(), stars)

    highest = await store.page(sort="highest")
    lowest = await store.page(sort="lowest")
    newest = await store.page(sort="newest", page_size=2)
    second = await store.page(sort="newest", page_size=2, page=2)

    assert [r["rating"] for r in highest["items"]] == [5, 3, 1]
    assert [r["rating"] for r in lowest["items"]] == [1, 3, 5]
    assert [r["rating"] for r in newest["items"]] == [1, 5]
    assert [r["rating"] for r in second["items"]] == [3]
    assert (newest["total"], newest["pages"]) == (3, 2)


# --- the viewer's own -------------------------------------------------------------------------


async def test_the_page_tells_a_visitor_what_they_can_do(store: Store) -> None:
    stranger = await register(store.api.client)
    buyer = await store.buyer()

    anonymous = await store.page()
    as_stranger = await store.page(stranger)
    before = await store.page(buyer)
    created = (await store.review(buyer, 4)).json()
    after = await store.page(buyer)

    assert anonymous["viewer"] is None
    assert as_stranger["viewer"] == {"purchased": False, "review": None, "can_review": False}
    assert before["viewer"] == {"purchased": True, "review": None, "can_review": True}
    assert after["viewer"]["can_review"] is False
    assert after["viewer"]["review"]["id"] == created["id"]


async def test_personal_pages_are_not_cached(store: Store) -> None:
    buyer = await store.buyer()

    signed_in = await store.api.client.get(store.url, headers=buyer.auth)

    assert signed_in.headers["cache-control"] == "no-store"


# --- changing and deleting your own -----------------------------------------------------------


async def test_you_can_change_your_review_and_the_average_follows(store: Store) -> None:
    buyer = await store.buyer()
    review = (await store.review(buyer, 5, title="Great", body="Loved it")).json()

    response = await store.api.client.patch(
        f"/api/v1/reviews/{review['id']}",
        json={"rating": 2, "title": None},
        headers=buyer.auth,
    )

    body = response.json()
    assert response.status_code == 200, response.text
    assert (body["rating"], body["title"], body["body"]) == (2, None, "Loved it")
    assert (await store.product())["rating_average"] == 2.0


async def test_a_rating_cannot_be_removed_or_emptied(store: Store) -> None:
    buyer = await store.buyer()
    review = (await store.review(buyer, 5)).json()

    cleared = await store.api.client.patch(
        f"/api/v1/reviews/{review['id']}", json={"rating": None}, headers=buyer.auth
    )
    out_of_range = await store.api.client.patch(
        f"/api/v1/reviews/{review['id']}", json={"rating": 9}, headers=buyer.auth
    )

    assert (cleared.status_code, out_of_range.status_code) == (422, 422)
    assert (await store.product())["rating_average"] == 5.0


async def test_deleting_your_review_takes_it_out_of_the_average_and_lets_you_write_another(
    store: Store,
) -> None:
    keeper, leaver = await store.buyer(), await store.buyer()
    await store.review(keeper, 4)
    mine = (await store.review(leaver, 1)).json()

    response = await store.api.client.delete(f"/api/v1/reviews/{mine['id']}", headers=leaver.auth)

    assert response.status_code == 204
    product = await store.product()
    assert (product["rating_average"], product["rating_count"]) == (4.0, 1)
    assert (await store.review(leaver, 2)).status_code == 201


async def test_deleting_the_only_review_resets_the_product(store: Store) -> None:
    buyer = await store.buyer()
    mine = (await store.review(buyer, 3)).json()

    await store.api.client.delete(f"/api/v1/reviews/{mine['id']}", headers=buyer.auth)

    product = await store.product()
    assert (product["rating_average"], product["rating_count"]) == (None, 0)


@pytest.mark.parametrize("method", ["patch", "delete"])
async def test_nobody_else_can_touch_your_review(store: Store, method: str) -> None:
    author, other = await store.buyer(), await store.buyer()
    review = (await store.review(author, 5)).json()

    response = await store.api.client.request(
        method.upper(), f"/api/v1/reviews/{review['id']}", json={"rating": 1}, headers=other.auth
    )
    anonymous = await store.api.client.request(
        method.upper(), f"/api/v1/reviews/{review['id']}", json={"rating": 1}
    )

    assert (response.status_code, anonymous.status_code) == (404, 401)
    assert (await store.page())["summary"]["average"] == 5.0


# --- moderation -------------------------------------------------------------------------------


async def test_a_hidden_review_leaves_the_page_and_the_average_and_comes_back(store: Store) -> None:
    friendly, rude = await store.buyer(), await store.buyer()
    await store.review(friendly, 5)
    abusive = (await store.review(rude, 1, body="Rude words")).json()

    hidden = await store.moderate(abusive["id"], "hide")

    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["status"] == "hidden"
    page = await store.page()
    assert [r["rating"] for r in page["items"]] == [5]
    assert page["summary"]["average"] == 5.0
    assert (await store.product())["rating_count"] == 1
    # The author still sees theirs, marked hidden, and cannot post a second one.
    own = (await store.page(rude))["viewer"]
    assert own["review"]["status"] == "hidden"
    assert own["can_review"] is False

    restored = await store.moderate(abusive["id"], "publish")

    assert restored.json()["status"] == "published"
    assert (await store.product())["rating_average"] == 3.0
    assert (await store.page())["summary"]["count"] == 2


async def test_hiding_twice_changes_nothing_more(store: Store) -> None:
    review = (await store.review(await store.buyer(), 2)).json()

    await store.moderate(review["id"], "hide")
    again = await store.moderate(review["id"], "hide")

    assert again.status_code == 200
    assert (await store.product())["rating_count"] == 0


async def test_the_moderation_queue_shows_everything_with_the_product_and_author(
    store: Store,
) -> None:
    first, second = await store.buyer(), await store.buyer()
    kept = (await store.review(first, 5, body="Lovely jacket")).json()
    flagged = (await store.review(second, 1, title="Awful")).json()
    await store.moderate(flagged["id"], "hide")

    everything = await store.api.client.get(f"{ADMIN}/reviews", headers=store.admin.auth)
    hidden = await store.api.client.get(
        f"{ADMIN}/reviews", params={"status": "hidden"}, headers=store.admin.auth
    )
    by_text = await store.api.client.get(
        f"{ADMIN}/reviews", params={"q": "lovely"}, headers=store.admin.auth
    )
    by_email = await store.api.client.get(
        f"{ADMIN}/reviews", params={"q": second.email}, headers=store.admin.auth
    )
    five_stars = await store.api.client.get(
        f"{ADMIN}/reviews", params={"rating": 5}, headers=store.admin.auth
    )

    body = everything.json()
    assert [r["id"] for r in body["items"]] == [flagged["id"], kept["id"]]
    assert body["status_counts"] == {"published": 1, "hidden": 1}
    first_row = body["items"][1]
    assert first_row["product"]["id"] == store.product_id
    assert first_row["product"]["image"]["thumb_400"]
    assert (first_row["author_email"], first_row["user_id"]) == (first.email, first.user_id)
    assert [r["id"] for r in hidden.json()["items"]] == [flagged["id"]]
    assert hidden.json()["total"] == 1
    assert [r["id"] for r in by_text.json()["items"]] == [kept["id"]]
    assert [r["id"] for r in by_email.json()["items"]] == [flagged["id"]]
    assert [r["id"] for r in five_stars.json()["items"]] == [kept["id"]]


async def test_only_administrators_moderate(store: Store) -> None:
    buyer = await store.buyer()
    review = (await store.review(buyer, 5)).json()

    for method, path in (
        ("GET", "/reviews"),
        ("POST", f"/reviews/{review['id']}/hide"),
        ("POST", f"/reviews/{review['id']}/publish"),
    ):
        anonymous = await store.api.client.request(method, ADMIN + path)
        customer = await store.api.client.request(method, ADMIN + path, headers=buyer.auth)
        assert (anonymous.status_code, customer.status_code) == (401, 403)
    assert (await store.page())["summary"]["count"] == 1


async def test_moderating_an_unknown_review_is_a_404(store: Store) -> None:
    response = await store.moderate(999999, "hide")

    assert response.status_code == 404
    assert response.json()["type"] == "urn:angel:problem:review-not-found"


# --- names ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("full_name", "shown"),
    [
        ("Ada Lovelace", "Ada L."),
        ("ada byron king lovelace", "ada L."),
        ("Cher", "Cher"),
        ("Deleted user", "Deleted user"),
        ("", "Deleted user"),
    ],
)
def test_authors_are_shown_by_first_name_and_initial(full_name: str, shown: str) -> None:
    assert author_name(User(full_name=full_name)) == shown
