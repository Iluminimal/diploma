"use client";

import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { errorFromResponse, networkError } from "@/lib/api/errors";

async function fetchCatalogNav(signal?: AbortSignal) {
  let result;
  try {
    result = await createApiClient().GET("/api/v1/catalog/nav", { signal });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!result.data) throw await errorFromResponse(result.response);
  return result.data;
}

/**
 * Header цэсүүдийн ард байх ангиллын мод. Layout биш browser дээр татдаг тул хуудас бүр API-аас
 * хамааралгүй (боломжтой бол static) байна; API таван минут cache хийхийг зөвшөөрдөг тул нааш цааш
 * явахад зардалгүй.
 */
export function useCatalogNav(enabled = true) {
  return useQuery({
    queryKey: ["catalog-nav"],
    queryFn: ({ signal }) => fetchCatalogNav(signal),
    enabled,
    staleTime: 10 * 60_000,
  });
}
