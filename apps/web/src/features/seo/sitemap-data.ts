import "server-only";
import { createApiClient } from "@/lib/api/client";
import { errorFromResponse, networkError } from "@/lib/api/errors";
import { SITEMAP_CHUNK } from "./sitemap";

const REVALIDATE_SECONDS = 3600;

async function fetchPage(page: number, pageSize: number) {
  let result;
  try {
    result = await createApiClient(REVALIDATE_SECONDS).GET("/api/v1/catalog/sitemap", {
      params: { query: { page, page_size: pageSize } },
    });
  } catch (cause) {
    throw networkError(cause);
  }
  if (result.data === undefined) throw await errorFromResponse(result.response);
  return result.data;
}

/** Идэвхтэй бүтээгдэхүүн хэд байгаа (нэг хямд хүсэлт: нэг бүтээгдэхүүний хуудас). */
export async function countProducts(): Promise<number> {
  return (await fetchPage(1, 1)).total;
}

/** Нэг sitemap файлын бүтээгдэхүүнүүд. */
export async function productsForSitemap(chunk: number) {
  return (await fetchPage(chunk + 1, SITEMAP_CHUNK)).items;
}
