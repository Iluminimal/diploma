"""CSV гаргалт: зөвхөн админ, Excel-д нээгдэх, томьёоны инжекцгүй."""

import csv
import io
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.core.csv_export import safe_cell
from tests.admin.test_admin_orders_api import administrator, in_stock, place_order
from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin"


def rows(body: str) -> list[list[str]]:
    assert body.startswith("﻿")
    return list(csv.reader(io.StringIO(body.removeprefix("﻿"))))


async def test_the_stats_export_has_one_row_per_day_of_the_period(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        await place_order(api, in_stock(api, 0), pay=True)

        response = await api.client.get(
            f"{ADMIN}/export/stats", params={"days": 7}, headers=admin.auth
        )

        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/csv")
        assert 'attachment; filename="angel-stats-' in response.headers["content-disposition"]
        table = rows(response.text)
        assert table[0] == ["date", "revenue_cents", "orders", "units", "new_customers"]
        assert len(table) == 1 + 7
        assert table[-1][2:4] == ["1", "2"]


async def test_the_orders_export_follows_the_status_filter(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        _, paid = await place_order(api, in_stock(api, 0), pay=True)
        await place_order(api, in_stock(api, 1), pay=False)

        everything = rows((await api.client.get(f"{ADMIN}/export/orders", headers=admin.auth)).text)
        only_paid = rows(
            (
                await api.client.get(
                    f"{ADMIN}/export/orders", params={"status": "paid"}, headers=admin.auth
                )
            ).text
        )

        assert everything[0][0] == "number"
        assert len(everything) == 3
        assert [r[0] for r in only_paid[1:]] == [paid]
        assert only_paid[1][2] == "paid"


@pytest.mark.parametrize("cell", ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"])
def test_text_that_looks_like_a_formula_is_quoted(cell: str) -> None:
    assert safe_cell(cell) == "'" + cell


@pytest.mark.parametrize("cell", ["Болд", "a=b", 5, None])
def test_other_values_are_left_alone(cell: object) -> None:
    assert safe_cell(cell) == cell
