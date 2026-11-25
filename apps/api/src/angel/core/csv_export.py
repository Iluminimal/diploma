"""CSV гаргалт: Excel-д зөв нээгдэх (UTF-8 BOM) ба томьёоны инжекцээс хамгаалсан (`=`, `+`, `-`,
`@`-ээр эхэлсэн текстийг `'` угтварлана)."""

import csv
import io
from collections.abc import Iterable, Sequence
from typing import Any

from fastapi import Response

_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    """Хэрэглэгчийн оруулсан текстийг (нэр, имэйл) Excel томьёо гэж тайлбарлуулахгүй."""
    if isinstance(value, str) and value.startswith(_FORMULA_STARTS):
        return "'" + value
    return value


def csv_response(filename: str, header: Sequence[str], rows: Iterable[Sequence[Any]]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow([safe_cell(cell) for cell in row])
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
