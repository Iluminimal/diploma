import { createApiClient } from "@/lib/api/client";
import { errorFromResponse, networkError } from "@/lib/api/errors";

/**
 * Header-ийн хайлтын талбарт зориулсан текстийн шилдэг таарал (зөвхөн browser; cache-гүй тул
 * бичихэд шууд мэдрэгдэнэ).
 */
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
