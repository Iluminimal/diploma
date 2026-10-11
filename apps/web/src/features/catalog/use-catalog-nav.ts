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
 * The category tree behind the header's menus. Fetched in the browser rather than by the layout,
 * so every page stays independent of the API (and static where it can be); the API marks it
 * cacheable for five minutes, so navigating around costs nothing.
 */
export function useCatalogNav(enabled = true) {
  return useQuery({
    queryKey: ["catalog-nav"],
    queryFn: ({ signal }) => fetchCatalogNav(signal),
    enabled,
    staleTime: 10 * 60_000,
  });
}
