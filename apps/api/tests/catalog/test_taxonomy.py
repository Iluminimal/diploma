from angel.models import Category
from angel.schemas.catalog.catalog import NavDepartment
from angel.services.catalog.taxonomy import TaxonomySnapshot, build_snapshot


def category(id_: int, parent: int | None, level: int, name: str, path: str) -> Category:
    return Category(
        id=id_, parent_id=parent, level=level, name=name, slug=path.rsplit("/", 1)[-1], path=path
    )


CATEGORIES = [
    category(1, None, 1, "Apparel", "apparel"),
    category(2, None, 1, "Accessories", "accessories"),
    category(3, None, 1, "Footwear", "footwear"),
    category(10, 1, 2, "Topwear", "apparel/topwear"),
    category(11, 1, 2, "Dress", "apparel/dress"),
    category(12, 2, 2, "Belts", "accessories/belts"),
    category(13, 3, 2, "Shoes", "footwear/shoes"),
    category(20, 10, 3, "Tshirts", "apparel/topwear/tshirts"),
    category(21, 10, 3, "Dresses", "apparel/topwear/dresses"),  # misfiled duplicate
    category(22, 11, 3, "Dresses", "apparel/dress/dresses"),
    category(23, 12, 3, "Tshirts", "accessories/belts/tshirts"),  # misfiled, other master
    category(24, 13, 3, "Casual Shoes", "footwear/shoes/casual-shoes"),
    category(25, 12, 3, "Belts", "accessories/belts/belts"),
]
COUNTS = [
    ("Men", 20, 10),
    ("Women", 20, 6),
    ("Unisex", 20, 2),
    ("Women", 22, 8),
    ("Women", 21, 2),
    ("Men", 23, 1),
    ("Boys", 24, 4),
    ("Men", 24, 5),
    ("Men", 25, 3),
]


def department(snapshot: TaxonomySnapshot, slug: str) -> NavDepartment:
    return next(d for d in snapshot.nav.departments if d.slug == slug)


def test_duplicate_article_types_collapse_into_the_leaf_with_most_products() -> None:
    snapshot = build_snapshot(CATEGORIES, COUNTS)

    assert snapshot.category_ids["apparel/dress/dresses"] == [21, 22]
    assert "apparel/topwear/dresses" not in snapshot.category_ids
    assert snapshot.category_ids["apparel/topwear/tshirts"] == [20, 23]
    assert "accessories/belts/tshirts" not in snapshot.category_ids


def test_parents_cover_the_ids_of_everything_below_them() -> None:
    snapshot = build_snapshot(CATEGORIES, COUNTS)

    assert snapshot.category_ids["apparel/topwear"] == [20, 23]
    assert snapshot.category_ids["apparel"] == [20, 21, 22, 23]
    assert snapshot.category_ids["footwear"] == [24]


def test_counts_follow_the_department_genders_and_never_double_count() -> None:
    snapshot = build_snapshot(CATEGORIES, COUNTS)

    women = department(snapshot, "women")
    men = department(snapshot, "men")
    kids = department(snapshot, "kids")
    # Women = Women + Unisex; the misfiled dresses (21) and Men's misfiled t-shirt (23) merge in.
    assert women.product_count == 6 + 2 + 8 + 2
    assert men.product_count == 10 + 2 + 1 + 5 + 3
    assert kids.product_count == 4
    topwear = next(s for g in men.groups for s in g.children if s.slug == "topwear")
    assert [(n.name, n.product_count) for n in topwear.children] == [("T-shirts", 10 + 2 + 1)]


def test_empty_nodes_and_departments_are_left_out() -> None:
    snapshot = build_snapshot(CATEGORIES, COUNTS)

    kids = department(snapshot, "kids")
    assert [g.slug for g in kids.groups] == ["footwear"]
    assert build_snapshot(CATEGORIES, []).nav.departments == []


def test_groups_come_in_shopping_order_with_readable_names() -> None:
    snapshot = build_snapshot(CATEGORIES, COUNTS)

    men = department(snapshot, "men")
    assert [g.slug for g in men.groups] == ["apparel", "footwear", "accessories"]
    assert [g.name for g in men.groups] == ["Clothing", "Footwear", "Accessories"]
