"use client";

import { EyeOff, RotateCcw, Search, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { selectClass } from "@/components/forms/form-field";
import { RatingStars } from "@/components/product/rating-stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { AdminReview, ReviewListParams } from "./admin-api";
import { day } from "./format";
import { toQuery } from "./list-params";
import { ListPagination } from "./list-pagination";
import { AdminPageHeader } from "./page-header";
import { useAdminReviews, useSetReviewPublished } from "./use-admin";

const DEFAULTS = { q: "", status: "all", rating: 0, page: 1 };
const TABS: { status: ReviewListParams["status"]; label: string }[] = [
  { status: "all", label: "All" },
  { status: "published", label: "Published" },
  { status: "hidden", label: "Hidden" },
];

function ReviewCard({ review }: { review: AdminReview }) {
  const setPublished = useSetReviewPublished();
  const hidden = review.status === "hidden";
  return (
    <li className="bg-background border-border flex gap-4 rounded-2xl border p-4 sm:p-5">
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
          {hidden && <Badge variant="destructive">Hidden</Badge>}
          <Link href={`/admin/products/${review.product.id}`} className="text-muted-foreground min-w-0 truncate hover:underline">
            {review.product.name}
          </Link>
        </div>
        {review.title && <p className="font-medium break-words">{review.title}</p>}
        {review.body ? <p className="break-words whitespace-pre-line">{review.body}</p> : <p className="text-muted-foreground">No written review.</p>}
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
            className="h-9 rounded-lg px-3"
            disabled={setPublished.isPending}
            aria-label={`Publish the review by ${review.author}`}
            onClick={() => setPublished.mutate({ id: review.id, published: true }, { onSuccess: () => toast.success("Review published.") })}
          >
            <RotateCcw aria-hidden /> Publish
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-9 rounded-lg px-3"
            disabled={setPublished.isPending}
            aria-label={`Hide the review by ${review.author}`}
            onClick={() =>
              setPublished.mutate(
                { id: review.id, published: false },
                { onSuccess: () => toast.success("Review hidden. It no longer counts towards the rating.") },
              )
            }
          >
            <EyeOff aria-hidden /> Hide
          </Button>
        )}
      </div>
    </li>
  );
}

export function ReviewsList({ params }: { params: ReviewListParams }) {
  const router = useRouter();
  const { data, isPending, error, refetch, isFetching } = useAdminReviews(params);
  const href = (change: Partial<ReviewListParams>) => `/admin/reviews${toQuery({ ...params, page: 1, ...change }, DEFAULTS)}`;
  const counts = data?.status_counts;
  const countOf = (status: ReviewListParams["status"]) =>
    counts === undefined ? undefined : status === "all" ? Object.values(counts).reduce((sum, n) => sum + n, 0) : (counts[status] ?? 0);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.replace(href({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() }));
  };

  return (
    <div>
      <AdminPageHeader title="Reviews" description="What customers say. Hide a review to take it off the product page and out of the rating." />
      <div className="space-y-6">
        <nav aria-label="Review status" className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex gap-1">
            {TABS.map(({ status, label }) => {
              const current = params.status === status;
              const count = countOf(status);
              return (
                <li key={status} className="shrink-0">
                  <Link
                    href={href({ status })}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring/60 inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium outline-none focus-visible:ring-3",
                      current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {label}{" "}
                    {count !== undefined && (
                      <span className={cn("rounded-full px-1.5 text-xs tabular-nums", current ? "bg-background/20" : "bg-muted text-muted-foreground")}>
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <form onSubmit={search} role="search" aria-label="Search reviews" className="flex flex-1 gap-2 sm:max-w-md">
            <Input
              key={params.q}
              name="q"
              type="search"
              defaultValue={params.q}
              placeholder="Text, product or email"
              aria-label="Text, product or email"
              className="h-11 rounded-xl"
            />
            <Button type="submit" variant="outline" className="h-11 rounded-full px-4">
              <Search aria-hidden /> Search
            </Button>
          </form>
          <select
            aria-label="Stars"
            className={cn(selectClass, "w-auto")}
            value={params.rating}
            onChange={(event) => router.replace(href({ rating: Number(event.target.value) }))}
          >
            <option value={0}>Any rating</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={stars}>
                {stars} {stars === 1 ? "star" : "stars"}
              </option>
            ))}
          </select>
        </div>

        {isPending ? (
          <Skeleton aria-busy aria-label="Loading reviews" className="h-64 rounded-2xl" />
        ) : error || !data ? (
          <div className="space-y-3">
            <p role="alert" className="text-destructive">
              {userMessage(error)}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : data.total === 0 ? (
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="bg-muted grid size-14 place-items-center rounded-full">
              <Star aria-hidden className="text-muted-foreground size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-medium">No reviews found</h2>
              <p className="text-muted-foreground text-sm">Customers can review what they have bought once it arrives.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4" aria-busy={isFetching}>
            <ul aria-label="Reviews, newest first" className="space-y-3">
              {data.items.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </ul>
            <ListPagination label="Reviews pages" page={data.page} pages={data.pages} total={data.total} hrefFor={(page) => href({ page })} />
          </div>
        )}
      </div>
    </div>
  );
}
