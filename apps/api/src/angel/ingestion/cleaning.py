"""Kaggle-ийн анхны `styles.csv`-ийг шалгасан, диск дээр зурагтай бүтээгдэхүүн болгоно."""

import csv
import re
from collections import Counter
from collections.abc import Collection
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

DEFAULT_MASTER_CATEGORIES = ("Apparel", "Footwear", "Accessories")
GENDERS = frozenset({"Men", "Women", "Boys", "Girls", "Unisex"})
REQUIRED_COLUMNS = (
    "id",
    "gender",
    "masterCategory",
    "subCategory",
    "articleType",
    "productDisplayName",
)
OPTIONAL_COLUMNS = ("baseColour", "season", "year", "usage")
MIN_YEAR, MAX_YEAR = 1990, 2100
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class CleanProduct:
    source_id: int
    name: str
    gender: str
    master_category: str
    sub_category: str
    article_type: str
    base_colour: str | None
    season: str | None
    usage: str | None
    year: int | None
    image_path: Path


@dataclass
class CleaningReport:
    csv_records: int = 0
    kept: int = 0
    dropped: Counter[str] = field(default_factory=Counter)

    def render(self) -> str:
        lines = [f"styles.csv records: {self.csv_records}", f"kept: {self.kept}"]
        lines += [f"dropped ({reason}): {n}" for reason, n in sorted(self.dropped.items())]
        return "\n".join(lines)


def _clean_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    collapsed = _WHITESPACE.sub(" ", value).strip()
    return collapsed or None


def _parse_year(value: object) -> int | None:
    text = _clean_text(value)
    if text is None or not text.replace(".", "", 1).isdigit():
        return None
    year = int(float(text))
    return year if MIN_YEAR <= year <= MAX_YEAR else None


def _count_csv_records(path: Path) -> int:
    with path.open(newline="", encoding="utf-8") as handle:
        return max(0, sum(1 for _ in csv.reader(handle)) - 1)


def load_catalog(
    styles_csv: Path,
    images_dir: Path,
    *,
    master_categories: Collection[str] = DEFAULT_MASTER_CATEGORIES,
) -> tuple[list[CleanProduct], CleaningReport]:
    """Dataset-ийг parse, validate, шүүнэ. Үр дүн id-аар эрэмбэлэгдсэн (тогтмол дараалал)."""
    report = CleaningReport(csv_records=_count_csv_records(styles_csv))
    # Файлд хашилтгүй таслалтай (талбар хэт олон) мөр байдаг. `skip` тэдгээрийг хасна; талбар нь
    # дутуу мөр NaN-аар дүүргэгдэж, доорх шаардлагатай талбарын шалгалтад баригдана.
    frame = pd.read_csv(styles_csv, dtype=str, on_bad_lines="skip", keep_default_na=False)
    if (malformed := report.csv_records - len(frame)) > 0:
        report.dropped["malformed_row"] = malformed

    missing = [c for c in (*REQUIRED_COLUMNS, *OPTIONAL_COLUMNS) if c not in frame.columns]
    if missing:
        raise ValueError(f"styles.csv is missing columns: {', '.join(missing)}")

    wanted = {c.casefold() for c in master_categories}
    seen: set[int] = set()
    products: list[CleanProduct] = []
    for row in frame.to_dict("records"):
        text = {col: _clean_text(row[col]) for col in (*REQUIRED_COLUMNS, *OPTIONAL_COLUMNS)}
        if any(text[col] is None for col in REQUIRED_COLUMNS):
            report.dropped["missing_required_field"] += 1
            continue
        raw_id = text["id"]
        assert raw_id is not None
        if not raw_id.isdigit():
            report.dropped["invalid_id"] += 1
            continue
        source_id = int(raw_id)
        if source_id in seen:
            report.dropped["duplicate_id"] += 1
            continue
        seen.add(source_id)
        gender = (text["gender"] or "").title()
        if gender not in GENDERS:
            report.dropped["invalid_gender"] += 1
            continue
        if (text["masterCategory"] or "").casefold() not in wanted:
            report.dropped["out_of_scope_category"] += 1
            continue
        image_path = images_dir / f"{source_id}.jpg"
        if not image_path.is_file() or image_path.stat().st_size == 0:
            report.dropped["missing_image"] += 1
            continue
        products.append(
            CleanProduct(
                source_id=source_id,
                name=text["productDisplayName"] or "",
                gender=gender,
                master_category=text["masterCategory"] or "",
                sub_category=text["subCategory"] or "",
                article_type=text["articleType"] or "",
                base_colour=text["baseColour"],
                season=text["season"],
                usage=text["usage"],
                year=_parse_year(row["year"]),
                image_path=image_path,
            )
        )
    products.sort(key=lambda p: p.source_id)
    report.kept = len(products)
    return products, report
