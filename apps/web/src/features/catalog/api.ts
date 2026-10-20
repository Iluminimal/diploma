import "server-only";
import { cache } from "react";
import { createApiClient } from "@/lib/api/client";
import { ApiError, errorFromResponse, networkError } from "@/lib/api/errors";
import { toApiFilters, type ListingQuery } from "./filters";

async function unwrap<T>(
  call: Promise<{ data?: T; response: Response }>,
): Promise<T> {
  let result;
  try {
    result = await call;
  } catch (cause) {
    throw networkError(cause);
  }
  if (result.data === undefined) throw await errorFromResponse(result.response);
  return result.data;
}

/** Ангиллын мод ба сонголтын жагсаалт. 10 минут cache хийнэ, API-ийн адил. */
export const getCatalogFilters = cache(() =>
  unwrap(createApiClient(600).GET("/api/v1/catalog/filters")),
);

/** Ангиллын мод, тоо бүхий department-ууд. 10 минут cache хийнэ, API-ийн адил. */
export const getCatalogNav = cache(() => unwrap(createApiClient(600).GET("/api/v1/catalog/nav")));

export const listProducts = cache((query: ListingQuery, pageSize = 24) =>
  unwrap(
    createApiClient(60).GET("/api/v1/products", {
      params: {
        query: {
          ...toApiFilters(query),
          q: query.q,
          department: query.department,
          category: query.category,
          sort: query.sort,
          page: query.page,
          page_size: pageSize,
        },
      },
    }),
  ),
);

/**
 * Үл мэдэгдэх эсвэл идэвхгүй бүтээгдэхүүнд `null` буцаана, ингэснээр хуудас `notFound()` дуудаж
 * чадна.
 */
export const getProduct = cache(async (id: number) => {
  try {
    return await unwrap(
      createApiClient(60).GET("/api/v1/products/{product_id}", {
        params: { path: { product_id: id } },
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
});

/**
 * Бүтээгдэхүүний сэтгэгдлийн эхний хуудас, шинэ нь түрүүнд. Авч чадахгүй бол `null`: хуудас тэднээс
 * хамаарахгүй.
 */
export const getProductReviews = cache(async (id: number) => {
  try {
    return await unwrap(
      createApiClient(60).GET("/api/v1/products/{product_id}/reviews", {
        params: { path: { product_id: id }, query: { sort: "newest", page: 1, page_size: 5 } },
      }),
    );
  } catch {
    return null;
  }
});

export const getSimilarProducts = cache((id: number, limit = 12) =>
  unwrap(
    createApiClient(300).GET("/api/v1/products/{product_id}/similar", {
      params: { path: { product_id: id }, query: { limit } },
    }),
  ),
);
