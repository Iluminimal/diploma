import { createApiClient } from "@/lib/api/client";
import { errorFromResponse, networkError } from "@/lib/api/errors";

/** Top text matches for the header search box (browser only; uncached so typing feels live). */
export async function suggestProducts(q: string, signal?: AbortSignal) {
  let result;
  try {
    result = await createApiClient().GET("/api/v1/products", {
      params: { query: { q, sort: "relevance", page_size: 5 } },
      signal,
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!result.data) throw await errorFromResponse(result.response);
  return result.data.items;
}
