from pathlib import Path

import pytest

from angel.ingestion.cleaning import load_catalog

HEADER = (
    "id,gender,masterCategory,subCategory,articleType,baseColour,season,year,usage,"
    "productDisplayName"
)


def _write(tmp_path: Path, rows: list[str], images: list[int]) -> tuple[Path, Path]:
    styles = tmp_path / "styles.csv"
    styles.write_text("\n".join([HEADER, *rows]) + "\n", encoding="utf-8")
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    for image_id in images:
        (images_dir / f"{image_id}.jpg").write_bytes(b"\xff\xd8not-really-a-jpeg")
    return styles, images_dir


def test_valid_rows_are_kept_sorted_and_normalised(tmp_path: Path) -> None:
    styles, images = _write(
        tmp_path,
        [
            "20,men,Apparel,Topwear,Shirts,Navy  Blue,Fall,2011,Casual,  Check   Shirt ",
            "10,Women,Footwear,Shoes,Heels,Red,,2012,,Red Heels",
        ],
        [10, 20],
    )
    products, report = load_catalog(styles, images)

    assert [p.source_id for p in products] == [10, 20]
    shirt = products[1]
    assert (shirt.gender, shirt.base_colour, shirt.name) == ("Men", "Navy Blue", "Check Shirt")
    assert shirt.year == 2011
    heels = products[0]
    assert heels.season is None
    assert heels.usage is None
    assert report.kept == 2
    assert not report.dropped


def test_malformed_rows_are_skipped_and_counted(tmp_path: Path) -> None:
    styles, images = _write(
        tmp_path,
        [
            "1,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,Good Shirt",
            # unquoted comma in the name -> too many fields
            "2,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,Shirt, with comma",
            # too few fields: name missing entirely
            "3,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual",
        ],
        [1, 2, 3],
    )
    products, report = load_catalog(styles, images)

    assert [p.source_id for p in products] == [1]
    assert report.csv_records == 3
    assert report.dropped["malformed_row"] == 1
    assert report.dropped["missing_required_field"] == 1


@pytest.mark.parametrize(
    ("row", "image_ids", "reason"),
    [
        ("5,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,No Image Shirt", [], "missing_image"),
        (
            "6,Men,Personal Care,Fragrance,Perfume,Blue,Fall,2011,Casual,Perfume",
            [6],
            "out_of_scope_category",
        ),
        ("7,Robot,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,Odd Gender", [7], "invalid_gender"),
        ("abc,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,Bad Id", [], "invalid_id"),
        (",Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,No Id", [], "missing_required_field"),
    ],
)
def test_rows_are_dropped_with_a_reason(
    tmp_path: Path, row: str, image_ids: list[int], reason: str
) -> None:
    styles, images = _write(tmp_path, [row], image_ids)
    products, report = load_catalog(styles, images)
    assert products == []
    assert report.dropped[reason] == 1


def test_empty_image_file_counts_as_missing(tmp_path: Path) -> None:
    styles, images = _write(
        tmp_path, ["8,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,Shirt"], []
    )
    (images / "8.jpg").write_bytes(b"")
    _, report = load_catalog(styles, images)
    assert report.dropped["missing_image"] == 1


def test_duplicate_ids_keep_the_first_and_scope_is_configurable(tmp_path: Path) -> None:
    styles, images = _write(
        tmp_path,
        [
            "9,Men,Apparel,Topwear,Shirts,Blue,Fall,2011,Casual,First",
            "9,Men,Apparel,Topwear,Shirts,Red,Fall,2011,Casual,Second",
            "11,Men,Personal Care,Fragrance,Perfume,Blue,Fall,2011,Casual,Perfume",
        ],
        [9, 11],
    )
    products, report = load_catalog(styles, images, master_categories=["apparel", "Personal Care"])
    assert [(p.source_id, p.name) for p in products] == [(9, "First"), (11, "Perfume")]
    assert report.dropped["duplicate_id"] == 1


def test_year_outside_plausible_range_is_ignored(tmp_path: Path) -> None:
    styles, images = _write(
        tmp_path, ["12,Men,Apparel,Topwear,Shirts,Blue,Fall,20110,Casual,Shirt"], [12]
    )
    products, _ = load_catalog(styles, images)
    assert products[0].year is None


def test_missing_columns_fail_loudly(tmp_path: Path) -> None:
    styles = tmp_path / "styles.csv"
    styles.write_text("id,gender\n1,Men\n")
    with pytest.raises(ValueError, match="missing columns"):
        load_catalog(styles, tmp_path)
