"""Худалдан авагчид харагдах ангиллын мод: department > бүлэг > дэд ангилал > article type.

`categories` хүснэгт нь dataset-ийг (master > sub > article type) тусгана. Хоёр зүйл үүнийг
навигаци болгоход тохиромжгүй болгодог:

- Gender модонд байхгүй, гэтэл худалдан авагчид "Women" эсвэл "Men"-ээс эхэлдэг.
- Арван нэг article type-ийн нэр хоёр эцэгтэй, ихэнхдээ өгөгдлийн алдаа (Belts доорх "Tshirts",
  Topwear доорх "Dresses"). Хамгийн их бараатай leaf яллаж бусдыг шингээнэ, тиймээс нэр бүр модонд
  яг нэг газартай, бараа хоёр удаа тоологдохгүй.

Энд бүх зүйл pure: service мөрүүдийг оруулж, үр дүнг cache хийнэ."""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel

from angel.models import Category
from angel.schemas.catalog.catalog import CatalogNav, NavDepartment, NavNode


@dataclass(frozen=True)
class Department:
    slug: str
    name: str
    genders: tuple[str, ...]


# Unisex бараа women, men хоёуланд харагдана; kids нь тусдаа department.
DEPARTMENTS: tuple[Department, ...] = (
    Department("women", "Women", ("Women", "Unisex")),
    Department("men", "Men", ("Men", "Unisex")),
    Department("kids", "Kids", ("Boys", "Girls")),
)
DEPARTMENT_BY_SLUG = {d.slug: d for d in DEPARTMENTS}

# Цэсэнд муухай харагдах dataset-ийн түүхий нэрс. Бусад нь хадгалсан хэвээрээ харагдана.
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
# Худалдан авагчид эхлээд хувцас, дараа гутал, дараа нь бусдыг хүлээдэг.
MASTER_ORDER = ("apparel", "footwear", "accessories")


class TaxonomySnapshot(BaseModel):
    """Cache юу хадгалдаг вэ: навигацийн мод болон зангилаа бүрийн path-д жагсаалт таарах ёстой
    category id-нууд (зангилаа нь үр удам болон шингээсэн давхардлуудыг хамарна)."""

    nav: CatalogNav
    category_ids: dict[str, list[int]]


def display_name(name: str) -> str:
    return DISPLAY_NAMES.get(name, name)


def build_snapshot(
    categories: Sequence[Category], counts: Sequence[tuple[str, int, int]]
) -> TaxonomySnapshot:
    """`counts` нь бараатай нүд бүрийн (gender, category_id, идэвхтэй барааны тоо)."""
    by_id = {c.id: c for c in categories}
    per_category: dict[int, int] = defaultdict(int)
    for _gender, category_id, n in counts:
        per_category[category_id] += n

    leaves = [c for c in categories if c.level == 3]
    by_name: dict[str, list[Category]] = defaultdict(list)
    for leaf in leaves:
        by_name[leaf.name].append(leaf)

    # canonical leaf id -> түүний хамарсан бүх leaf id
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
