"""Shopper-facing category tree: departments > groups > sub-categories > article types.

The `categories` table mirrors the dataset (master > sub > article type). Two things make it
unfit for navigation as it is:

- Gender is not part of the tree, but shoppers start from "Women" or "Men".
- Eleven article-type names sit under two parents, mostly data errors (a "Tshirts" under Belts,
  "Dresses" under Topwear). The leaf with the most products wins and absorbs the others, so each
  name has exactly one place in the tree and a product is never counted twice.

Everything here is pure: the service feeds in rows and caches the result.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel

from angel.models import Category
from angel.schemas.catalog import CatalogNav, NavDepartment, NavNode


@dataclass(frozen=True)
class Department:
    slug: str
    name: str
    genders: tuple[str, ...]


# Unisex products are shown to both women and men; kids are their own department.
DEPARTMENTS: tuple[Department, ...] = (
    Department("women", "Women", ("Women", "Unisex")),
    Department("men", "Men", ("Men", "Unisex")),
    Department("kids", "Kids", ("Boys", "Girls")),
)
DEPARTMENT_BY_SLUG = {d.slug: d for d in DEPARTMENTS}

# Raw dataset names that read badly in a menu. Anything else is shown as stored.
DISPLAY_NAMES = {
    "Apparel": "Clothing",
    "Apparel Set": "Sets",
    "Tshirts": "T-shirts",
    "Lounge Tshirts": "Lounge T-shirts",
    "Sandal": "Sandals",
    "Loungewear and Nightwear": "Loungewear & nightwear",
    "Necklace and Chains": "Necklaces & chains",
    "Perfume and Body Mist": "Perfume & body mist",
    "Ties and Cufflinks": "Ties & cufflinks",
    "Innerwear Vests": "Vests",
    "Key chain": "Key chains",
    "Salwar and Dupatta": "Salwar & dupatta",
}
# Shoppers expect clothing first, then shoes, then the rest.
MASTER_ORDER = ("apparel", "footwear", "accessories")


class TaxonomySnapshot(BaseModel):
    """What the cache stores: the navigation tree plus, for each node path, the category ids a
    listing must match (a node covers its descendants and the duplicates it absorbed)."""

    nav: CatalogNav
    category_ids: dict[str, list[int]]


def display_name(name: str) -> str:
    return DISPLAY_NAMES.get(name, name)


def build_snapshot(
    categories: Sequence[Category], counts: Sequence[tuple[str, int, int]]
) -> TaxonomySnapshot:
    """`counts` is (gender, category_id, active product count) for every populated cell."""
    by_id = {c.id: c for c in categories}
    per_category: dict[int, int] = defaultdict(int)
    for _gender, category_id, n in counts:
        per_category[category_id] += n

    leaves = [c for c in categories if c.level == 3]
    by_name: dict[str, list[Category]] = defaultdict(list)
    for leaf in leaves:
        by_name[leaf.name].append(leaf)

    # canonical leaf id -> every leaf id it covers
    members: dict[int, list[int]] = {}
    for group in by_name.values():
        canonical = max(group, key=lambda c: (per_category[c.id], -c.id))
        members[canonical.id] = sorted(c.id for c in group)

    category_ids: dict[str, list[int]] = {}
    sub_leaves: dict[int, list[Category]] = defaultdict(list)
    for leaf_id in members:
        leaf = by_id[leaf_id]
        category_ids[leaf.path] = members[leaf_id]
        if leaf.parent_id is not None:
            sub_leaves[leaf.parent_id].append(leaf)
    master_subs: dict[int, list[Category]] = defaultdict(list)
    for sub_id, children in sub_leaves.items():
        sub = by_id[sub_id]
        category_ids[sub.path] = sorted(i for child in children for i in members[child.id])
        if sub.parent_id is not None:
            master_subs[sub.parent_id].append(sub)
    for master_id, subs in master_subs.items():
        master = by_id[master_id]
        category_ids[master.path] = sorted(
            i for sub in subs for child in sub_leaves[sub.id] for i in members[child.id]
        )

    gender_counts: dict[str, dict[int, int]] = defaultdict(dict)
    for gender, category_id, n in counts:
        gender_counts[gender][category_id] = gender_counts[gender].get(category_id, 0) + n

    def count_for(genders: tuple[str, ...], ids: list[int]) -> int:
        return sum(gender_counts[g].get(i, 0) for g in genders for i in ids)

    def node(category: Category, count: int, children: list[NavNode]) -> NavNode:
        return NavNode(
            name=display_name(category.name),
            slug=category.slug,
            path=category.path,
            level=category.level,
            product_count=count,
            children=children,
        )

    def by_count(nodes: list[NavNode]) -> list[NavNode]:
        return sorted(nodes, key=lambda n: (-n.product_count, n.name))

    departments: list[NavDepartment] = []
    for department in DEPARTMENTS:
        groups: list[NavNode] = []
        for master_id, subs in master_subs.items():
            sub_nodes: list[NavNode] = []
            for sub in subs:
                leaf_nodes = [
                    node(leaf, c, [])
                    for leaf in sub_leaves[sub.id]
                    if (c := count_for(department.genders, members[leaf.id])) > 0
                ]
                if leaf_nodes:
                    total = sum(n.product_count for n in leaf_nodes)
                    sub_nodes.append(node(sub, total, by_count(leaf_nodes)))
            if sub_nodes:
                total = sum(n.product_count for n in sub_nodes)
                groups.append(node(by_id[master_id], total, by_count(sub_nodes)))
        groups.sort(
            key=lambda g: (
                MASTER_ORDER.index(g.slug) if g.slug in MASTER_ORDER else len(MASTER_ORDER),
                -g.product_count,
            )
        )
        if groups:
            departments.append(
                NavDepartment(
                    slug=department.slug,
                    name=department.name,
                    genders=list(department.genders),
                    product_count=sum(g.product_count for g in groups),
                    groups=groups,
                )
            )
    return TaxonomySnapshot(nav=CatalogNav(departments=departments), category_ids=category_ids)
