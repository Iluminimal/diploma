"""Ажилтны үйлдлийн журнал: үйлдэл бүр нэг мөр, зөвхөн админ харна."""

from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.admin.test_admin_orders_api import administrator, in_stock, place_order, warehouse_worker
from tests.conftest import Api, ApiFactory
from tests.support.commerce import Shopper
from tests.support.fakes import RecordingGateway

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin"
SHIP = {"carrier": "DHL", "tracking_number": "JD0146"}


async def audit(api: Api, admin: Shopper, **params: Any) -> dict[str, Any]:
    response = await api.client.get(f"{ADMIN}/audit", params=params, headers=admin.auth)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def test_a_stock_change_is_logged_with_who_and_the_before_and_after(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=4, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        product = api.entries[0].product_id
        before = (await api.client.get(f"{ADMIN}/products/{product}", headers=worker.auth)).json()[
            "stock_quantity"
        ]

        await api.client.put(
            f"{ADMIN}/products/{product}/stock", json={"quantity": 42}, headers=worker.auth
        )

        entry = (await audit(api, admin))["items"][0]
        assert entry["action"] == "product.stock"
        assert (entry["entity_type"], entry["entity_id"]) == ("product", str(product))
        assert entry["data"] == {"previous": before, "quantity": 42}
        assert (entry["actor_id"], entry["actor_label"]) == (worker.user_id, worker.email)


async def test_setting_the_same_stock_again_logs_nothing(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=4, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        product = api.entries[0].product_id
        url = f"{ADMIN}/products/{product}/stock"
        current = (await api.client.get(f"{ADMIN}/products/{product}", headers=worker.auth)).json()[
            "stock_quantity"
        ]
        quantity = current + 1

        await api.client.put(url, json={"quantity": quantity}, headers=worker.auth)
        await api.client.put(url, json={"quantity": quantity}, headers=worker.auth)

        assert (await audit(api, admin))["total"] == 1


async def test_withdrawing_and_restoring_a_product_are_logged_separately(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=4, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        product = api.entries[0].product_id

        await api.client.post(f"{ADMIN}/products/{product}/deactivate", headers=worker.auth)
        await api.client.post(f"{ADMIN}/products/{product}/activate", headers=worker.auth)

        actions = [e["action"] for e in (await audit(api, admin))["items"]]
        assert actions == ["product.activate", "product.deactivate"]


async def test_order_actions_are_logged_for_the_staff_member_who_did_them(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path, gateway=RecordingGateway()) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        _, shipped = await place_order(api, in_stock(api, 0), pay=True)
        _, refunded = await place_order(api, in_stock(api, 1), pay=True)
        await api.client.post(f"{ADMIN}/orders/{shipped}/ship", json=SHIP, headers=worker.auth)
        await api.client.post(f"{ADMIN}/orders/{shipped}/deliver", headers=worker.auth)
        await api.client.post(
            f"{ADMIN}/orders/{refunded}/refund",
            json={"reason": "damaged", "restock": True},
            headers=admin.auth,
        )
        await api.client.post(
            f"{ADMIN}/orders/{refunded}/notes", json={"text": "called"}, headers=admin.auth
        )

        items = (await audit(api, admin))["items"]

        assert [(e["action"], e["entity_id"], e["actor_label"]) for e in items] == [
            ("order.note", refunded, admin.email),
            ("order.refund", refunded, admin.email),
            ("order.deliver", shipped, worker.email),
            ("order.ship", shipped, worker.email),
        ]
        assert items[3]["data"] == {"carrier": "DHL", "tracking_number": "JD0146"}
        assert items[1]["data"]["reason"] == "damaged"
        assert items[1]["data"]["restock"] is True


async def test_a_refused_action_leaves_no_trace(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        _, unpaid = await place_order(api, in_stock(api, 0), pay=False)

        response = await api.client.post(
            f"{ADMIN}/orders/{unpaid}/ship", json=SHIP, headers=worker.auth
        )

        assert response.status_code == 409
        assert (await audit(api, admin))["total"] == 0


async def test_the_log_filters_by_who_what_and_kind_and_pages(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        _, paid = await place_order(api, in_stock(api, 0), pay=True)
        product = in_stock(api, 1).product_id
        await api.client.put(
            f"{ADMIN}/products/{product}/stock", json={"quantity": 9}, headers=worker.auth
        )
        await api.client.post(f"{ADMIN}/orders/{paid}/ship", json=SHIP, headers=worker.auth)
        await api.client.post(
            f"{ADMIN}/orders/{paid}/notes", json={"text": "hi"}, headers=admin.auth
        )

        by_worker = await audit(api, admin, actor_id=worker.user_id)
        orders_only = await audit(api, admin, entity_type="order")
        stock_only = await audit(api, admin, action="product.stock")
        first_page = await audit(api, admin, page_size=2)

        assert by_worker["total"] == 2
        assert orders_only["total"] == 2
        assert [e["action"] for e in stock_only["items"]] == ["product.stock"]
        assert (len(first_page["items"]), first_page["total"], first_page["pages"]) == (2, 3, 2)


@pytest.mark.parametrize("params", [{"action": "nonsense"}, {"entity_type": "user"}, {"page": 0}])
async def test_the_log_refuses_unknown_filters(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path, params: dict[str, Any]
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        response = await api.client.get(f"{ADMIN}/audit", params=params, headers=admin.auth)

        assert response.status_code == 422
