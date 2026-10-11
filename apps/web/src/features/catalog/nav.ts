import type { components } from "@/lib/api/client";

export type CatalogNav = components["schemas"]["CatalogNav"];
export type NavDepartment = components["schemas"]["NavDepartment"];
export type NavNode = components["schemas"]["NavNode"];

/**
 * The departments in the header. Known without a request, so the links render (and crawl) with
 * the page itself; the category panels behind them arrive from `GET /catalog/nav`.
 */
export const DEPARTMENT_LINKS = [
  { slug: "women", label: "Women" },
  { slug: "men", label: "Men" },
  { slug: "kids", label: "Kids" },
] as const;

/** `/c/men`, `/c/men/apparel/topwear/tshirts`. A node's `path` is exactly what follows the department. */
export function categoryHref(department: string, path?: string): string {
  return path ? `/c/${department}/${path}` : `/c/${department}`;
}

export type CategoryTrail = {
  department: NavDepartment;
  /** Group, sub-category, article type: as deep as the URL goes. */
  nodes: NavNode[];
};

/**
 * Resolve URL segments against the nav. `null` for anything that is not in it, which includes
 * categories with no products, so a stale link is a 404 and never an empty page.
 */
export function findTrail(nav: CatalogNav, departmentSlug: string, segments: string[] = []): CategoryTrail | null {
  const department = nav.departments.find((d) => d.slug === departmentSlug);
  if (!department) return null;
  const nodes: NavNode[] = [];
  let level = department.groups;
  for (const segment of segments) {
    const node = level.find((n) => n.slug === segment);
    if (!node) return null;
    nodes.push(node);
    level = node.children;
  }
  return { department, nodes };
}

/** Every URL worth listing in a sitemap: departments and all nodes below them. */
export function categoryPaths(nav: CatalogNav): string[] {
  const out: string[] = [];
  const walk = (department: string, nodes: NavNode[]) => {
    for (const node of nodes) {
      out.push(categoryHref(department, node.path));
      walk(department, node.children);
    }
  };
  for (const department of nav.departments) {
    out.push(categoryHref(department.slug));
    walk(department.slug, department.groups);
  }
  return out;
}

/** Most popular article types across a department's groups, for quick links in the menu. */
export function popularTypes(department: NavDepartment, limit = 8): NavNode[] {
  return department.groups
    .flatMap((group) => group.children.flatMap((sub) => sub.children))
    .sort((a, b) => b.product_count - a.product_count)
    .slice(0, limit);
}

/**
 * What a category page lets you step into next. On a leaf there is nothing below, so the
 * siblings are offered instead (and the leaf itself drops out of `ancestors`).
 */
export function drilldown(department: NavDepartment, nodes: NavNode[]) {
  const current = nodes.at(-1);
  const isLeaf = current !== undefined && current.children.length === 0;
  const ancestors = isLeaf ? nodes.slice(0, -1) : nodes;
  const parent = ancestors.at(-1);
  return { ancestors, options: parent ? parent.children : department.groups, current };
}

/**
 * Sub-categories and article types whose name contains the text, biggest first. The same name
 * can sit in several departments ("T-shirts" for Men and for Women); each is its own result.
 */
export function matchCategories(nav: CatalogNav, text: string, limit: number): { department: NavDepartment; node: NavNode }[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  const hits: { department: NavDepartment; node: NavNode }[] = [];
  for (const department of nav.departments) {
    for (const group of department.groups) {
      for (const sub of group.children) {
        if (sub.name.toLowerCase().includes(needle)) hits.push({ department, node: sub });
        for (const leaf of sub.children) {
          if (leaf.name.toLowerCase().includes(needle)) hits.push({ department, node: leaf });
        }
      }
    }
  }
  return hits.sort((a, b) => b.node.product_count - a.node.product_count).slice(0, limit);
}
