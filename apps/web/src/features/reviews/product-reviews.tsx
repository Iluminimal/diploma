"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { RatingStars } from "@/components/product/rating-stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/auth-store";
import { useFormat } from "@/i18n/use-format";
import { useUserMessage } from "@/lib/api/use-user-message";
import { ReviewForm } from "./review-form";
import { REVIEW_SORTS, type Review, type ReviewPage, type ReviewSort } from "./reviews-api";
import { useDeleteReview, useReviews } from "./use-reviews";

const DAY: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

/** Үнэлгээний хуваарилалт, од бүрт нэг bar, олон одтой нь түрүүнд. */
function Distribution({ distribution, count }: { distribution: number[]; count: number }) {
  const t = useTranslations("reviews");
  return (
    <ul aria-label={t("byStars")} className="space-y-1.5 type-caption">
      {[5, 4, 3, 2, 1].map((stars) => {
        const n = distribution[stars - 1] ?? 0;
        return (
          <li key={stars} className="flex items-center gap-3">
            <span className="w-14 shrink-0 tabular-nums">{t("stars", { stars })}</span>
            <span aria-hidden className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <span className="block h-full rounded-full bg-star" style={{ width: count ? `${(n / count) * 100}%` : 0 }} />
            </span>
            <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">
              {n}
              <span className="sr-only"> {t("starsCount", { count: n })}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewItem({ review, mine, productId }: { review: Review; mine: boolean; productId: number }) {
  const t = useTranslations("reviews");
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteReview(productId);

  if (editing) {
    return (
      <li className="bg-secondary/60 rounded-2xl p-4 sm:p-5">
        <ReviewForm productId={productId} review={review} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="space-y-2 py-6 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RatingStars rating={review.rating} />
        {review.title && <h3 className="font-semibold">{review.title}</h3>}
      </div>
      {review.body && <p className="type-caption leading-relaxed break-words whitespace-pre-line">{review.body}</p>}
      <p className="text-muted-foreground type-fine">
        {mine ? t("you") : review.author} · <time dateTime={review.created_at}>{format.date(review.created_at, DAY)}</time>
      </p>
      {mine && review.status === "hidden" && (
        <p role="status" className="text-muted-foreground bg-muted rounded-lg px-3 py-2 type-fine">
          <Badge variant="secondary" className="mr-2">
            {t("hidden")}
          </Badge>
          {t("hiddenNote")}
        </p>
      )}
      {mine && (
        <div className="flex gap-2 pt-1">
          <Button variant="bordered" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> {t("edit")}
          </Button>
          <Button variant="bordered" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden /> {t("delete")}
          </Button>
        </div>
      )}
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              {t("keep")}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(review.id, {
                  onSuccess: () => {
                    toast.success(t("deleted"));
                    setDeleting(false);
                  },
                })
              }
            >
              {t("deleteSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** Зочин сэтгэгдэл бичихэд юу хийж болох: form, эсвэл чадахгүй шалтгаан. */
function WriteReview({ productId, page }: { productId: number; page: ReviewPage }) {
  const t = useTranslations("reviews");
  const status = useAuth((state) => state.status);
  const viewer = page.viewer;
  if (status === "signedOut") {
    return (
      <p className="text-muted-foreground type-caption">
        {t.rich("signInToReview", {
          link: (chunks) => (
            <Link
              href={`/login?next=${encodeURIComponent(`/products/${productId}#reviews`)}`}
              className="text-brand underline underline-offset-2 hover:no-underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }
  if (!viewer) return null;
  if (viewer.can_review) {
    return (
      <div className="bg-secondary/60 rounded-2xl p-4 sm:p-5">
        <h3 className="mb-4 font-semibold">{t("write")}</h3>
        <ReviewForm productId={productId} />
      </div>
    );
  }
  if (!viewer.purchased) {
    return <p className="text-muted-foreground type-caption">{t("onlyBuyers")}</p>;
  }
  return null;
}

/**
 * Бүтээгдэхүүний сэтгэгдэл: дундаж ба бүрэлдэхүүн, сэтгэгдлүүд өөрсдөө, мөн (худалдаж авсан
 * үйлчлүүлэгчид) бичих form. Эхний хуудас хуудастайгаа хамт ирнэ; үлдсэнийг шаардлагатай үед татна.
 */
export function ProductReviews({ productId, initial }: { productId: number; initial: ReviewPage | null }) {
  const t = useTranslations("reviews");
  const userMessage = useUserMessage();
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [pageNumber, setPageNumber] = useState(1);
  const { data, error, refetch, isFetching } = useReviews(productId, sort, pageNumber, initial);

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="defer-render mt-20 scroll-mt-24">
      <h2 id="reviews-heading" className="type-title mb-6 md:mb-8">
        {t("title")}
      </h2>
      {!data ? (
        error ? (
          <div className="space-y-3">
            <p role="alert" className="text-muted-foreground type-caption">
              {userMessage(error)}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              {t("tryAgain")}
            </Button>
          </div>
        ) : (
          <p aria-busy className="text-muted-foreground type-caption">
            {t("loading")}
          </p>
        )
      ) : (
        <div className="grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-6">
            {data.summary.count > 0 && data.summary.average !== null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="type-display tabular-nums">{data.summary.average.toFixed(1)}</span>
                  <div className="space-y-1">
                    <RatingStars rating={data.summary.average} size="lg" />
                    <p className="text-muted-foreground type-caption">
                      {t("count", { count: data.summary.count })}
                    </p>
                  </div>
                </div>
                <Distribution distribution={data.summary.distribution} count={data.summary.count} />
              </div>
            ) : (
              <p className="text-muted-foreground type-caption">{t("none")}</p>
            )}
            <WriteReview productId={productId} page={data} />
          </div>

          <div className="min-w-0 space-y-4">
            {data.viewer?.review && !data.items.some((item) => item.id === data.viewer?.review?.id) && (
              <ul aria-label={t("yours")} className="space-y-4">
                <ReviewItem review={data.viewer.review} mine productId={productId} />
              </ul>
            )}
            {data.total > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground type-caption">
                    {t("showing", {
                      from: (data.page - 1) * data.page_size + 1,
                      to: (data.page - 1) * data.page_size + data.items.length,
                      total: data.total,
                    })}
                  </p>
                  <NativeSelect
                    variant="pill"
                    aria-label={t("sortLabel")}
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as ReviewSort);
                      setPageNumber(1);
                    }}
                  >
                    {REVIEW_SORTS.map((value) => (
                      <option key={value} value={value}>
                        {t(`sort.${value}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <ul aria-label={t("list")} aria-busy={isFetching} className="divide-border divide-y">
                  {data.items.map((review) => (
                    <ReviewItem key={review.id} review={review} mine={data.viewer?.review?.id === review.id} productId={productId} />
                  ))}
                </ul>
                {data.pages > 1 && (
                  <nav aria-label={t("pages")} className="flex items-center justify-between type-caption">
                    <Button variant="bordered" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>
                      {t("previous")}
                    </Button>
                    <span className="text-muted-foreground">
                      {t("pageOf", { page: data.page, pages: data.pages })}
                    </span>
                    <Button variant="bordered" disabled={pageNumber >= data.pages} onClick={() => setPageNumber(pageNumber + 1)}>
                      {t("next")}
                    </Button>
                  </nav>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
