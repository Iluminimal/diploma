"use client";

import { EyeOff, RotateCcw, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { BulkBar } from "@/components/admin/bulk-bar";
import { useSelection } from "@/components/admin/data-table";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchForm } from "@/components/admin/search-form";
import { SegmentedNav } from "@/components/admin/segmented";
import { RatingStars } from "@/components/product/rating-stars";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AdminReview, ReviewListParams } from "./admin-api";
import { useDates } from "./format";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { AdminPageHeader } from "./page-header";
import { useAdminReviews, useBulkSetReviewPublished, useSetReviewPublished } from "./use-admin";
import { QueryError } from "@/components/ui/query-error";

const DEFAULTS = { q: "", status: "all", rating: 0, page: 1 };
const TABS = [
  { status: "all", key: "tabAll" },
  { status: "published", key: "tabPublished" },
  { status: "hidden", key: "tabHidden" },
] as const satisfies readonly { status: ReviewListParams["status"]; key: string }[];

function ReviewCard({ review, checked, onToggle }: { review: AdminReview; checked: boolean; onToggle: () => void }) {
  const t = useTranslations("admin.reviews");
  const { day } = useDates();
  const setPublished = useSetReviewPublished();
  const hidden = review.status === "hidden";
  return (
    <li className={cn("admin-surface flex items-start gap-4 p-4 sm:p-5", checked && "ring-2 ring-[var(--brand)]")}>
      <Checkbox aria-label={t("selectRow", { author: review.author })} checked={checked} onCheckedChange={onToggle} className="mt-1" />
      <Image
        src={review.product.image.thumb_400}
        alt=""
        width={400}
        height={533}
        sizes="56px"
        className="bg-muted hidden h-[4.5rem] w-14 shrink-0 rounded-lg object-cover sm:block"
      />
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <RatingStars rating={review.rating} />
          {hidden && <span className="bg-destructive/10 text-destructive-text rounded-full px-2 py-0.5 text-xs font-medium">{t("hidden")}</span>}
          <Link href={`/admin/products/${review.product.id}`} className="text-muted-foreground min-w-0 truncate hover:underline">
            {review.product.name}
          </Link>
        </div>
        {review.title && <p className="font-medium break-words">{review.title}</p>}
        {review.body ? <p className="break-words whitespace-pre-line">{review.body}</p> : <p className="text-muted-foreground">{t("noText")}</p>}
        <p className="text-muted-foreground text-xs">
          {review.author} ·{" "}
          <Link href={`/admin/customers/${review.user_id}`} className="hover:underline">
            {review.author_email ?? review.author_phone}
          </Link>{" "}
          · {day(review.created_at)}
        </p>
      </div>
      <div className="shrink-0">
        {hidden ? (
          <Button
            variant="outline"
            className="h-8 rounded-full px-3"
            disabled={setPublished.isPending}
            aria-label={t("publishLabel", { author: review.author })}
            onClick={() => setPublished.mutate({ id: review.id, published: true }, { onSuccess: () => toast.success(t("published")) })}
          >
            <RotateCcw aria-hidden /> {t("publish")}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-8 rounded-full px-3"
            disabled={setPublished.isPending}
            aria-label={t("hideLabel", { author: review.author })}
            onClick={() => setPublished.mutate({ id: review.id, published: false }, { onSuccess: () => toast.success(t("hiddenToast")) })}
          >
            <EyeOff aria-hidden /> {t("hide")}
          </Button>
        )}
      </div>
    </li>
  );
}

export function ReviewsList({ params }: { params: ReviewListParams }) {
  const t = useTranslations("admin.reviews");
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminReviews(params);
  const bulk = useBulkSetReviewPublished();
  const selection = useSelection<number>();
  const filterKey = JSON.stringify(params);
  const { clear } = selection;
  useEffect(() => clear(), [filterKey, clear]);

  const href = (change: Partial<ReviewListParams>) => `/admin/reviews${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const counts = data?.status_counts;
  const countOf = (status: ReviewListParams["status"]) =>
    counts === undefined ? undefined : status === "all" ? Object.values(counts).reduce((sum, n) => sum + n, 0) : (counts[status] ?? 0);

  const items = data?.items ?? [];
  const chosen = items.filter((review) => selection.selected.has(review.id));
  const anyVisible = chosen.some((review) => review.status !== "hidden");
  const anyHidden = chosen.some((review) => review.status === "hidden");
  const runBulk = (published: boolean) => {
    const ids = chosen.filter((review) => (review.status === "hidden") === published).map((review) => review.id);
    bulk.mutate(
      { ids, published },
      {
        onSuccess: ({ done, failed }) => {
          if (failed > 0) toast.error(t("bulkPartial", { done, failed }));
          else toast.success(t(published ? "bulkPublished" : "bulkHidden", { count: done }));
          selection.clear();
        },
      },
    );
  };

  return (
    <div>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedNav
            label={t("statusNav")}
            value={params.status}
            items={TABS.map(({ status, key }) => ({ key: status, label: t(key), count: countOf(status), href: href({ status }) }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchForm
              label={t("searchLabel")}
              placeholder={t("searchPlaceholder")}
              defaultValue={params.q}
              buttonLabel={t("search")}
              onSearch={(q) => router.replace(href({ q }))}
            />
            <NativeSelect variant="pill" aria-label={t("stars")} value={params.rating} onChange={(event) => router.replace(href({ rating: Number(event.target.value) }))}>
              <option value={0}>{t("anyRating")}</option>
              {[5, 4, 3, 2, 1].map((stars) => (
                <option key={stars} value={stars}>
                  {t("starsOption", { stars })}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {isPending ? (
          <Skeleton aria-busy aria-label={t("loading")} className="h-72 rounded-[var(--radius-tile)]" />
        ) : error || !data ? (
          <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
        ) : data.total === 0 ? (
          <EmptyState icon={Star} title={t("noneTitle")} description={t("noneHint")} bordered />
        ) : (
          <div className="space-y-4" aria-busy={isFetching}>
            <ul aria-label={t("list")} className="space-y-3">
              {data.items.map((review) => (
                <ReviewCard key={review.id} review={review} checked={selection.selected.has(review.id)} onToggle={() => selection.toggle(review.id)} />
              ))}
            </ul>
            <ListPagination label={t("pages")} page={data.page} pages={data.pages} total={data.total} hrefFor={(page) => href({ page })} />
          </div>
        )}
      </div>

      <BulkBar count={chosen.length} label={t("selectedCount", { count: chosen.length })} clearLabel={t("clearSelection")} onClear={selection.clear}>
        {anyVisible && (
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk(false)}>
            <EyeOff aria-hidden /> {t("hide")}
          </Button>
        )}
        {anyHidden && (
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk(true)}>
            <RotateCcw aria-hidden /> {t("publish")}
          </Button>
        )}
      </BulkBar>
    </div>
  );
}
