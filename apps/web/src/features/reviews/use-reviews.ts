"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  createReview,
  deleteReview,
  fetchReviews,
  updateReview,
  type ReviewChanges,
  type ReviewDraft,
  type ReviewPage,
  type ReviewSort,
} from "./reviews-api";

/**
 * A product's reviews. What the server rendered is used as it is for a visitor looking at the
 * first page; a signed-in customer fetches their own copy, which says whether they can review.
 */
export function useReviews(productId: number, sort: ReviewSort, page: number, initial: ReviewPage | null) {
  const status = useAuth((state) => state.status);
  const signedIn = status === "signedIn";
  const isFirstPage = sort === "newest" && page === 1;
  return useQuery({
    queryKey: [...queryKeys.reviews(productId), { sort, page, signedIn }],
    queryFn: () => fetchReviews(productId, sort, page),
    // Wait for the session to be known: a signed-in customer's answer differs from a visitor's.
    enabled: status !== "unknown",
    initialData: !signedIn && isFirstPage && initial ? initial : undefined,
    // The server's copy is for the first paint and for crawlers (it may be up to a minute old,
    // like the rest of the page): the browser fetches a current one straight away.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** Changes to a review also change the product's average, so every cached view of its reviews is refetched. */
function useReviewMutation<V, R>(productId: number, mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onError: (error) => toast.error(userMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.reviews(productId) }),
  });
}

export const useCreateReview = (productId: number) =>
  useReviewMutation(productId, (draft: ReviewDraft) => createReview(productId, draft));

export const useUpdateReview = (productId: number) =>
  useReviewMutation(productId, ({ id, changes }: { id: number; changes: ReviewChanges }) => updateReview(id, changes));

export const useDeleteReview = (productId: number) =>
  useReviewMutation(productId, (id: number) => deleteReview(id));
