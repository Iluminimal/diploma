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
 * Бүтээгдэхүүний сэтгэгдэл. Server-ээс render хийснийг эхний хуудсыг харж буй зочинд тэр хэвээр нь
 * ашиглана; нэвтэрсэн үйлчлүүлэгч өөрийн хуулбарыг татах бөгөөд тэр нь сэтгэгдэл бичиж болох
 * эсэхийг хэлнэ.
 */
export function useReviews(productId: number, sort: ReviewSort, page: number, initial: ReviewPage | null) {
  const status = useAuth((state) => state.status);
  const signedIn = status === "signedIn";
  const isFirstPage = sort === "newest" && page === 1;
  return useQuery({
    queryKey: [...queryKeys.reviews(productId), { sort, page, signedIn }],
    queryFn: () => fetchReviews(productId, sort, page),
    // Session мэдэгдэхийг хүлээнэ: нэвтэрсэн үйлчлүүлэгчийн хариу зочнийхоос өөр.
    enabled: status !== "unknown",
    initialData: !signedIn && isFirstPage && initial ? initial : undefined,
    // Server-ийн хуулбар нь эхний paint болон crawler-д зориулагдсан (хуудасны бусад хэсэг шиг нэг
    // минут хүртэл хуучин байж болно): browser шууд шинийг татна.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Сэтгэгдлийн өөрчлөлт бүтээгдэхүүний дундажийг бас өөрчилдөг тул cache-д байгаа бүх харагдацыг
 * дахин татна.
 */
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
