import { apiBaseUrl } from "@/lib/api/client";
import type { SearchResponse } from "@/features/catalog/product";
import { toApiFilters, type CatalogFilters } from "@/features/catalog/filters";
import { errorFromResponse, networkError } from "@/lib/api/errors";
import type { components } from "@/lib/api/client";

export type GarmentSearchResponse = components["schemas"]["GarmentSearchResponse"];
export type Garment = components["schemas"]["GarmentResult"];

export type ImageSearchParams = {
  filters: CatalogFilters;
  /** Хэрэглэгчийн сонгосон; илрүүлсэн ангилал зөвхөн санал бөгөөд хэрэгжихгүй. */
  articleType: string | null;
  /** Текстээр нарийсгах ("like this but in blue"). Хоосон биш бол hybrid search руу шилжинэ. */
  refinement: string;
  /** Зураг дээр олдсон хэд дэх хувцсаар хайх вэ (0 = хамгийн тод, анхдагч нь тул илгээхгүй). */
  region?: number;
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
  if (params.refinement.trim()) {
    form.append("query", params.refinement.trim());
    // Үгээс өнгө, улирал, үнэ гэх мэтийг шүүлтүүр болгоно (монгол, англи); API `applied`-д буцаана.
    form.append("interpret", "true");
  }
  if (params.region) form.append("region", String(params.region));
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

export type DetectResponse = components["schemas"]["DetectResponse"];

/**
 * Камерын live preview-ийн нэг кадраас хувцасны хайрцгийг авна (хайлт хийхгүй). Кадр зөвхөн шинжилгээнд
 * явна, сервер хадгалахгүй.
 */
export async function detectGarments(frame: Blob, signal?: AbortSignal): Promise<DetectResponse> {
  const form = new FormData();
  form.append("file", new File([frame], "frame.jpg", { type: "image/jpeg" }));
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/search/detect`, { method: "POST", body: form, signal });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as DetectResponse;
}

export type GarmentSearchParams = {
  filters: CatalogFilters;
  /** Хувцас тутамд хэдийг (нэгдсэн харагдацад цөөн: дэлгэрэнгүйг нь "бүгдийг харах" үзүүлнэ). */
  limit?: number;
};

export function buildGarmentForm(file: File, params: GarmentSearchParams): FormData {
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(toApiFilters(params.filters))) {
    if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
    else if (value !== undefined) form.append(key, String(value));
  }
  form.append("limit", String(params.limit ?? 6));
  return form;
}

/** Зурагт олдсон хувцас бүрийн төстэй бараа нэг хүсэлтээр. */
export async function searchGarments(
  file: File,
  params: GarmentSearchParams,
  signal?: AbortSignal,
): Promise<GarmentSearchResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/search/garments`, {
      method: "POST",
      body: buildGarmentForm(file, params),
      signal,
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as GarmentSearchResponse;
}

/** Нэг л хувцас олдсон үед нэгдсэн хариуг ердийн нэг-хувцасны хариу болгож, тэр харагдацыг дахин ашиглана. */
export function garmentAsSearchResponse(response: GarmentSearchResponse): SearchResponse {
  const [garment] = response.garments;
  return {
    results: garment?.results ?? [],
    detected: garment?.detected ?? [],
    regions: garment ? [garment.region] : [],
    selected_region: 0,
    timings: response.timings,
    cached: false,
    applied: [],
  };
}

/**
 * "Энэ шиг, гэхдээ ...": барааны хадгалсан embedding-д текст нэмнэ (зургийг дахин боловсруулахгүй).
 * Бүтээгдэхүүний хуудасны "Төстэй бараа" мөрийг нарийсгана.
 */
export async function searchSimilarWithText(
  productId: number,
  query: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ query: query.trim(), interpret: "true", limit: String(limit) });
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/products/${productId}/similar?${params}`, { signal });
  } catch (cause) {
    throw networkError(cause);
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as SearchResponse;
}
