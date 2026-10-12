"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/form-field";
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
import { userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ReviewForm } from "./review-form";
import { REVIEW_SORTS, type Review, type ReviewPage, type ReviewSort } from "./reviews-api";
import { useDeleteReview, useReviews } from "./use-reviews";

const SORT_LABELS: Record<ReviewSort, string> = {
  newest: "Most recent",
  highest: "Highest rated",
  lowest: "Lowest rated",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" });

/** How the ratings spread, one bar per number of stars, most stars first. */
function Distribution({ distribution, count }: { distribution: number[]; count: number }) {
  return (
    <ul aria-label="Ratings by number of stars" className="space-y-1.5 text-sm">
      {[5, 4, 3, 2, 1].map((stars) => {
        const n = distribution[stars - 1] ?? 0;
        return (
          <li key={stars} className="flex items-center gap-3">
            <span className="w-14 shrink-0 tabular-nums">{stars} {stars === 1 ? "star" : "stars"}</span>
            <span aria-hidden className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
              <span className="block h-full rounded-full bg-amber-500" style={{ width: count ? `${(n / count) * 100}%` : 0 }} />
            </span>
            <span className="text-muted-foreground w-8 shrink-0 text-right tabular-nums">
              {n}
              <span className="sr-only"> {n === 1 ? "review" : "reviews"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewItem({ review, mine, productId }: { review: Review; mine: boolean; productId: number }) {
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
      {review.body && <p className="text-sm leading-relaxed break-words whitespace-pre-line">{review.body}</p>}
      <p className="text-muted-foreground text-xs">
        {mine ? "You" : review.author} · <time dateTime={review.created_at}>{day(review.created_at)}</time>
      </p>
      {mine && review.status === "hidden" && (
        <p role="status" className="text-muted-foreground bg-muted rounded-lg px-3 py-2 text-xs">
          <Badge variant="secondary" className="mr-2">
            Hidden
          </Badge>
          The shop has hidden this review. Only you can see it.
        </p>
      )}
      {mine && (
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Edit
          </Button>
          <Button variant="outline" className="h-9 rounded-full px-3" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden /> Delete
          </Button>
        </div>
      )}
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your review?</DialogTitle>
            <DialogDescription>It disappears from the product page and from its rating. You can write a new one afterwards.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(review.id, {
                  onSuccess: () => {
                    toast.success("Your review is deleted.");
                    setDeleting(false);
                  },
                })
              }
            >
              Delete review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** What a visitor can do about writing one: the form, or the reason they cannot. */
function WriteReview({ productId, page }: { productId: number; page: ReviewPage }) {
  const status = useAuth((state) => state.status);
  const viewer = page.viewer;
  if (status === "signedOut") {
    return (
      <p className="text-muted-foreground text-sm">
        <Link href={`/login?next=${encodeURIComponent(`/products/${productId}#reviews`)}`} className="text-brand underline underline-offset-2 hover:no-underline">
          Sign in
        </Link>{" "}
        to review this product if you have bought it.
      </p>
    );
  }
  if (!viewer) return null;
  if (viewer.can_review) {
    return (
      <div className="bg-secondary/60 rounded-2xl p-4 sm:p-5">
        <h3 className="mb-4 font-semibold">Write a review</h3>
        <ReviewForm productId={productId} />
      </div>
    );
  }
  if (!viewer.purchased) {
    return <p className="text-muted-foreground text-sm">Only customers who have bought this product can review it.</p>;
  }
  return null;
}

/**
 * The reviews of a product: the average and how it is made up, the reviews themselves, and (for a
 * customer who bought it) the form to write one. The first page arrives with the page; the rest is
 * fetched as it is asked for.
 */
export function ProductReviews({ productId, initial }: { productId: number; initial: ReviewPage | null }) {
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [pageNumber, setPageNumber] = useState(1);
  const { data, error, refetch, isFetching } = useReviews(productId, sort, pageNumber, initial);

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="defer-render mt-20 scroll-mt-24">
      <h2 id="reviews-heading" className="mb-6 text-xl font-semibold tracking-tight">
        Customer reviews
      </h2>
      {!data ? (
        error ? (
          <div className="space-y-3">
            <p role="alert" className="text-muted-foreground text-sm">
              {userMessage(error)}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <p aria-busy className="text-muted-foreground text-sm">
            Loading reviews…
          </p>
        )
      ) : (
        <div className="grid gap-10 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-6">
            {data.summary.count > 0 && data.summary.average !== null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="text-5xl font-semibold tracking-tight tabular-nums">{data.summary.average.toFixed(1)}</span>
                  <div className="space-y-1">
                    <RatingStars rating={data.summary.average} size="lg" />
                    <p className="text-muted-foreground text-sm">
                      {data.summary.count} {data.summary.count === 1 ? "review" : "reviews"}
                    </p>
                  </div>
                </div>
                <Distribution distribution={data.summary.distribution} count={data.summary.count} />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No reviews yet. Be the first to share what you think.</p>
            )}
            <WriteReview productId={productId} page={data} />
          </div>

          <div className="min-w-0 space-y-4">
            {data.viewer?.review && !data.items.some((item) => item.id === data.viewer?.review?.id) && (
              <ul aria-label="Your review" className="space-y-4">
                <ReviewItem review={data.viewer.review} mine productId={productId} />
              </ul>
            )}
            {data.total > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    Showing {(data.page - 1) * data.page_size + 1}–{(data.page - 1) * data.page_size + data.items.length} of {data.total}
                  </p>
                  <select
                    aria-label="Sort reviews"
                    className={cn(selectClass, "w-auto")}
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as ReviewSort);
                      setPageNumber(1);
                    }}
                  >
                    {REVIEW_SORTS.map((value) => (
                      <option key={value} value={value}>
                        {SORT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <ul aria-label="Reviews" aria-busy={isFetching} className="divide-border divide-y">
                  {data.items.map((review) => (
                    <ReviewItem key={review.id} review={review} mine={data.viewer?.review?.id === review.id} productId={productId} />
                  ))}
                </ul>
                {data.pages > 1 && (
                  <nav aria-label="Reviews pages" className="flex items-center justify-between text-sm">
                    <Button variant="outline" className="h-9 rounded-full px-4" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>
                      Previous
                    </Button>
                    <span className="text-muted-foreground">
                      Page {data.page} of {data.pages}
                    </span>
                    <Button variant="outline" className="h-9 rounded-full px-4" disabled={pageNumber >= data.pages} onClick={() => setPageNumber(pageNumber + 1)}>
                      Next
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
