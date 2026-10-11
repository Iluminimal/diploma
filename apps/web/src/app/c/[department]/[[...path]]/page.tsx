import type { Metadata } from "next";
import { getCatalogFilters } from "@/features/catalog/api";
import { resolveTrail } from "@/features/catalog/category-trail";
import { CategoryBreadcrumbs } from "@/features/catalog/category-breadcrumbs";
import { CategoryChips } from "@/features/catalog/category-chips";
import { CategoryTree } from "@/features/catalog/category-tree";
import type { FilterGroup } from "@/features/catalog/filter-fields";
import { toHref } from "@/features/catalog/filters";
import { ListingView } from "@/features/catalog/listing-view";
import { categoryHref, drilldown, type CategoryTrail } from "@/features/catalog/nav";
import { parseListingQuery } from "@/features/catalog/parse-listing-query";

// The department already says who it is for, so the gender filter would only contradict it.
const GROUPS: FilterGroup[] = ["stock", "color", "price", "season", "usage"];

function titleOf({ department, nodes }: CategoryTrail): string {
  const node = nodes.at(-1);
  return node ? `${node.name} for ${department.name}` : department.name;
}

function pathOf({ department, nodes }: CategoryTrail): string {
  return categoryHref(department.slug, nodes.at(-1)?.path);
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/c/[department]/[[...path]]">): Promise<Metadata> {
  const trail = await resolveTrail(params);
  const query = parseListingQuery(await searchParams);
  const title = titleOf(trail);
  const canonical = toHref(pathOf(trail), { ...query, sort: undefined });
  const count = (trail.nodes.at(-1) ?? trail.department).product_count.toLocaleString("en-US");
  return {
    title,
    description: `Shop ${title.toLowerCase()} at Angel: ${count} pieces. Filter by colour, price and occasion.`,
    alternates: { canonical },
    openGraph: { title, url: canonical },
    robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[department]/[[...path]]">) {
  const trail = await resolveTrail(params);
  const options = await getCatalogFilters();
  const parsed = parseListingQuery(await searchParams);
  const query = { ...parsed, department: trail.department.slug, category: trail.nodes.at(-1)?.path };
  const { options: next } = drilldown(trail.department, trail.nodes);

  return (
    <ListingView
      title={titleOf(trail)}
      path={pathOf(trail)}
      query={query}
      options={options}
      above={<CategoryBreadcrumbs trail={trail} />}
      chips={
        <CategoryChips
          label="Subcategories"
          // The sidebar tree shows the same links beside the grid on wide screens.
          className="lg:hidden"
          items={next.map((node) => ({
            label: node.name,
            href: categoryHref(trail.department.slug, node.path),
            count: node.product_count,
          }))}
        />
      }
      asideTop={<CategoryTree trail={trail} />}
      showCategories={false}
      groups={GROUPS}
    />
  );
}
