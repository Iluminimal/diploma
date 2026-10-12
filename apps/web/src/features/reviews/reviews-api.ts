import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type Review = components["schemas"]["ReviewOut"];
export type ReviewPage = components["schemas"]["ReviewPage"];
export type ReviewDraft = components["schemas"]["ReviewCreate"];
export type ReviewChanges = components["schemas"]["ReviewUpdate"];

export const REVIEW_SORTS = ["newest", "highest", "lowest"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
export const REVIEWS_PER_PAGE = 5;

export const fetchReviews = (productId: number, sort: ReviewSort, page: number) =>
  call(
    browserApi().GET("/api/v1/products/{product_id}/reviews", {
      params: { path: { product_id: productId }, query: { sort, page, page_size: REVIEWS_PER_PAGE } },
    }),
  );

export const createReview = (productId: number, body: ReviewDraft) =>
  call(browserApi().POST("/api/v1/products/{product_id}/reviews", { params: { path: { product_id: productId } }, body }));

export const updateReview = (id: number, body: ReviewChanges) =>
  call(browserApi().PATCH("/api/v1/reviews/{review_id}", { params: { path: { review_id: id } }, body }));

export const deleteReview = (id: number) =>
  call(browserApi().DELETE("/api/v1/reviews/{review_id}", { params: { path: { review_id: id } } }));
