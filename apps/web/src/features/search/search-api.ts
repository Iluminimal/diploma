import { apiBaseUrl } from "@/lib/api/client";
import type { SearchResponse } from "@/features/catalog/product";
import { toApiFilters, type CatalogFilters } from "@/features/catalog/filters";
import { errorFromResponse, networkError } from "@/lib/api/errors";

export type ImageSearchParams = {
  filters: CatalogFilters;
  /** Хэрэглэгчийн сонгосон; илрүүлсэн ангилал зөвхөн санал бөгөөд хэрэгжихгүй. */
  articleType: string | null;
  /** Текстээр нарийсгах ("like this but in blue"). Хоосон биш бол hybrid search руу шилжинэ. */
  refinement: string;
  limit?: number;
};

/** Upload endpoint-ууд multipart form авдаг; давтагдсан талбар "аль нэг нь" гэсэн үг. */
export function buildSearchForm(file: File, params: ImageSearchParams): FormData {
  const form = new FormData();
  form.append("file", file);
  const filters = toApiFilters({
    ...params.filters,
    article_type: params.articleType ? [params.articleType] : params.filters.article_type,
  });
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
    else if (value !== undefined) form.append(key, String(value));
  }
  if (params.refinement.trim()) form.append("query", params.refinement.trim());
  form.append("limit", String(params.limit ?? 24));
  return form;
}

export async function searchByImage(
  file: File,
  params: ImageSearchParams,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const endpoint = params.refinement.trim() ? "hybrid" : "image";
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/search/${endpoint}`, {
      method: "POST",
      body: buildSearchForm(file, params),
      signal,
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as SearchResponse;
}
