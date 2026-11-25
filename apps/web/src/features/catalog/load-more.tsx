"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProductGrid } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { fetchProductPage } from "./browser-api";
import { toHref, type ListingQuery } from "./filters";

type Props = {
  query: ListingQuery;
  path: string;
  /** Server-ээс аль хэдийн харуулсан хуудасны барааны id-ууд (давхардлаас сэргийлнэ). */
  shownIds: number[];
  total: number;
  pages: number;
  pageSize: number;
};

/**
 * Server-ээс ирсэн `query.page` хуудсын доор дараагийн хуудсуудыг товчоор нэмж харуулна. Автоматаар
 * гүйлгэхгүй тул footer-т хүрэх боломж хэвээр. Нэмэх бүрт URL-ын `?page=` шинэчлэгдэж, дахин
 * ачаалах эсвэл холбоос хуваалцахад сүүлд үзсэн хуудас нээгдэнэ. Татсан хуудсууд TanStack Query-д
 * үлдэх тул бүтээгдэхүүн рүү орж буцахад дахин татахгүй.
 */
export function LoadMore({ query, path, shownIds, total, pages, pageSize }: Props) {
  const t = useTranslations("catalog");
  const more = useInfiniteQuery({
    queryKey: ["listing-more", query, pageSize],
    queryFn: ({ pageParam }) => fetchProductPage(query, pageParam, pageSize),
    initialPageParam: query.page + 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    // Анхны хуудсыг server өгсөн: зөвхөн товч дарахад л татна.
    enabled: false,
  });

  const seen = new Set(shownIds);
  const appended = (more.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((product) => !seen.has(product.id) && seen.add(product.id));
  const hasMore = more.data ? more.hasNextPage : query.page < pages;
  const shown = Math.min(total, (query.page - 1) * pageSize + shownIds.length + appended.length);

  const loadMore = async () => {
    const result = await more.fetchNextPage();
    const page = result.data?.pages.at(-1)?.page;
    if (page && !result.isError) window.history.replaceState(null, "", toHref(path, { ...query, page }));
  };

  return (
    <>
      {appended.length > 0 && (
        <div className="mt-8 sm:mt-10">
          <ProductGrid products={appended} columns={3} priorityCount={0} />
        </div>
      )}
      <div className="mt-12 flex flex-col items-center gap-4">
        <p className="text-muted-foreground type-body" role="status" aria-live="polite">
          {t("shownOf", { shown, total })}
        </p>
        <div
          aria-hidden
          className="bg-muted h-1 w-48 overflow-hidden rounded-full"
        >
          <div
            className="bg-foreground h-full rounded-full transition-[width] duration-500"
            style={{ width: `${total ? Math.min(100, (shown / total) * 100) : 0}%` }}
          />
        </div>
        {more.isFetchNextPageError && (
          <p role="alert" className="text-destructive type-caption">
            {t("loadMoreError")}
          </p>
        )}
        {hasMore && (
          <Button
            type="button"
            variant="outline"
            size="xl"
            disabled={more.isFetchingNextPage}
            onClick={() => void loadMore()}
          >
            {more.isFetchingNextPage && <Loader2 className="animate-spin" />}
            {more.isFetchNextPageError ? t("loadMoreRetry") : t("loadMore")}
          </Button>
        )}
      </div>
    </>
  );
}
