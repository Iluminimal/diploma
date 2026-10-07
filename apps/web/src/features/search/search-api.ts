import { apiBaseUrl } from "@/lib/api/client";
import type { SearchResponse } from "@/features/catalog/product";
import { toApiFilters, type CatalogFilters } from "@/features/catalog/filters";
import { errorFromResponse, networkError } from "@/lib/api/errors";

export type ImageSearchParams = {
  filters: CatalogFilters;
  /** Chosen by the user; the detected category is only a suggestion and is not applied. */
  articleType: string | null;
  /** Text refinement ("like this but in blue"). Non-empty switches to hybrid search. */
  refinement: string;
  limit?: number;
};

/** The upload endpoints take multipart forms; repeated fields mean "any of". */
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
