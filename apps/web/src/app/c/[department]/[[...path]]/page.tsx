import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
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
import { createFormat } from "@/i18n/format";
import { getVocab } from "@/i18n/server";
import type { Vocab } from "@/i18n/vocab";

// Department хэнд зориулагдсаныг аль хэдийн хэлдэг тул хүйсийн шүүлтүүр зөвхөн зөрчилдөнө.
const GROUPS: FilterGroup[] = ["stock", "color", "price", "season", "usage"];

type T = (key: "categoryTitle", values: { category: string; department: string }) => string;

function titleOf({ department, nodes }: CategoryTrail, t: T, vocab: Vocab): string {
  const node = nodes.at(-1);
  const name = vocab.department(department.name);
  return node ? t("categoryTitle", { category: vocab.category(node.name), department: name }) : name;
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
  const [t, vocab, locale] = await Promise.all([getTranslations("catalog"), getVocab(), getLocale()]);
  const title = titleOf(trail, t, vocab);
  const canonical = toHref(pathOf(trail), { ...query, sort: undefined });
  const count = createFormat(locale).number((trail.nodes.at(-1) ?? trail.department).product_count);
  return {
    title,
    description: t("categoryDescription", { title: title.toLowerCase(), count }),
    alternates: { canonical },
    openGraph: { title, url: canonical },
    robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[department]/[[...path]]">) {
  const trail = await resolveTrail(params);
  const [options, t, vocab] = await Promise.all([getCatalogFilters(), getTranslations("catalog"), getVocab()]);
  const parsed = parseListingQuery(await searchParams);
  const query = { ...parsed, department: trail.department.slug, category: trail.nodes.at(-1)?.path };
  const { options: next } = drilldown(trail.department, trail.nodes);

  return (
    <ListingView
      title={titleOf(trail, t, vocab)}
      path={pathOf(trail)}
      query={query}
      options={options}
      above={<CategoryBreadcrumbs trail={trail} />}
      chips={
        <CategoryChips
          label={t("subcategories")}
          // Өргөн дэлгэц дээр grid-ийн хажууд sidebar-ын мод ижил холбоосыг харуулна.
          className="lg:hidden"
          items={next.map((node) => ({
            label: vocab.category(node.name),
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
