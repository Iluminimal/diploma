import { Camera, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { ProductGrid, ProductGridSkeleton } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ActiveFilters } from "./active-filters";
import { listProducts } from "./api";
import { toHref, type ListingQuery } from "./filters";
import { LoadMore } from "./load-more";
import type { FilterGroup } from "./filter-fields";
import { FilterSidebar, MobileFilters, SortSelect } from "./listing-controls";
import { Pagination } from "./pagination";
import { PendingResults } from "./pending-results";
import { PopularRail } from "./popular-rail";
import type { CatalogFilterOptions } from "./product";

type Props = {
  title: string;
  /** Энэ жагсаалтын URL: шүүлтүүр, эрэмбэ, хуудас нь түүн рүү буцах холбоос. */
  path: string;
  query: ListingQuery;
  options: CatalogFilterOptions;
  /** Гарчгийн дээр (breadcrumbs). */
  above?: ReactNode;
  /** Гарчиг ба grid-ийн хооронд (дэд ангиллын chip). */
  chips?: ReactNode;
  /** Desktop sidebar-ын дээд хэсэг (ангиллын drill-down). */
  asideTop?: ReactNode;
  /** Checkbox ангиллын мод нь зам ангиллыг сонгоогүй үед л утгатай. */
  showCategories?: boolean;
  groups?: FilterGroup[];
};

/**
 * Гарчиг, шүүлтүүрийн sidebar, эрэмбэ, хуудаслалттай бүтээгдэхүүний grid; /products болон /c/...
 * хоёрт нийтлэг.
 */
export function ListingView({
  title,
  path,
  query,
  options,
  above,
  chips,
  asideTop,
  showCategories = true,
  groups,
}: Props) {
  const t = useTranslations("catalog");
  return (
    <div className="container-page relative isolate py-8 md:py-12">
      {/* Гарчгийн ард зөөлөн гэрэл (статик градиент, animate хийхгүй). */}
      <div aria-hidden className="aurora pointer-events-none absolute inset-x-2 top-0 -z-10 h-44 rounded-[2rem] opacity-80 [mask-image:linear-gradient(to_bottom,#000_30%,transparent)] md:inset-x-4 md:h-52" />
      {above}
      <div className="mb-6 flex flex-col gap-1 md:mb-8">
        <h1 className="type-display text-balance">{title}</h1>
        <Suspense fallback={<Skeleton className="h-6 w-28" />}>
          <ResultCount query={query} />
        </Suspense>
      </div>
      {chips}

      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <aside aria-label={t("filters")} className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-3">
            {asideTop}
            <FilterSidebar options={options} query={query} showCategories={showCategories} groups={groups} />
          </div>
        </aside>

        <section aria-label={t("productsLabel")} className="min-w-0">
          {/* Утсан дээр grid гүйлгэх үед шүүлтүүр, эрэмбийн товч header-ийн доор үлдэнэ. */}
          <div className="bg-background/85 sticky top-12 z-20 -mx-4 mb-5 flex items-center justify-between gap-3 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0">
            <MobileFilters options={options} query={query} showCategories={showCategories} groups={groups} />
            <div className="ml-auto">
              <SortSelect query={query} />
            </div>
          </div>
          <div className="mb-6 empty:hidden">
            <ActiveFilters query={query} path={path} />
          </div>

          {/* Boundary-д key өгөхгүй: шүүлтүүр солигдоход skeleton биш хуучин grid (бүдэг) хэвээр
             үлдэнэ. */}
          <Suspense fallback={<ProductGridSkeleton count={12} />}>
            <PendingResults>
              <Results query={query} path={path} />
            </PendingResults>
          </Suspense>
        </section>
      </div>
    </div>
  );
}

async function ResultCount({ query }: { query: ListingQuery }) {
  const [result, t] = await Promise.all([listProducts(query).catch(() => null), getTranslations("catalog")]);
  if (!result) return <p className="h-6" />; // шалтгааныг доорх жагсаалт тайлбарлана
  const { total } = result;
  return (
    <p className="text-muted-foreground type-body h-6" aria-live="polite">
      {t.rich("productCount", { count: total, n: (chunks) => <>{chunks}</> })}
    </p>
  );
}

async function Results({ query, path }: { query: ListingQuery; path: string }) {
  const [page, t] = await Promise.all([listProducts(query).catch(() => null), getTranslations("catalog")]);
  // API түр унасан ч шүүлтүүр, толгой хэвээр үлдэнэ; зөвхөн жагсаалтын оронд дахин оролдох товч.
  if (!page) return <ListingError href={toHref(path, query)} />;
  if (page.items.length === 0) return <NoResults query={query} path={path} />;
  return (
    <>
      {page.fuzzy && query.q && (
        <p role="status" className="bg-secondary type-caption mb-6 rounded-xl px-4 py-3">
          {t("fuzzyNotice", { query: t("quoted", { query: query.q }) })}
        </p>
      )}
      {query.page > 1 && (
        <p className="mb-6 text-center">
          <Link
            href={toHref(path, { ...query, page: query.page - 1 })}
            rel="prev"
            className="text-muted-foreground hover:text-foreground type-body underline underline-offset-4"
          >
            {t("earlier")}
          </Link>
        </p>
      )}
      <ProductGrid products={page.items} columns={3} priorityCount={3} />
      {/* key: шүүлтүүр, эрэмбэ, хуудас солигдоход нэмж татсан хуудсууд цэвэрлэгдэнэ. */}
      <LoadMore
        key={toHref(path, query)}
        query={query}
        path={path}
        shownIds={page.items.map((product) => product.id)}
        total={page.total}
        pages={page.pages}
        pageSize={page.page_size}
      />
      {/* JS-гүй орчинд товч ажиллахгүй тул хуудасны холбоос үлдэнэ. */}
      <noscript>
        <Pagination query={query} pages={page.pages} path={path} />
      </noscript>
    </>
  );
}

function ListingError({ href }: { href: string }) {
  const t = useTranslations("catalog");
  return (
    <EmptyState icon={SearchX} bordered title={t("loadError")} description={t("loadErrorHint")}>
      <Button asChild size="lg">
        <Link href={href}>{t("retry")}</Link>
      </Button>
    </EmptyState>
  );
}

function NoResults({ query, path }: { query: ListingQuery; path: string }) {
  const t = useTranslations("catalog");
  return (
    <>
      <EmptyState
        icon={SearchX}
        bordered
        title={query.q ? t("nothingMatches", { query: t("quoted", { query: query.q }) }) : t("nothingMatchesFilters")}
        description={t("nothingMatchesHint")}
      >
        <Button asChild variant="outline" size="lg">
          <Link href={path}>{t("clearFilters")}</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/search">
            <Camera /> {t("searchByPhoto")}
          </Link>
        </Button>
      </EmptyState>
      <Suspense fallback={null}>
        <PopularRail />
      </Suspense>
    </>
  );
}
