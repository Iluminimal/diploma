import createClient from "openapi-fetch";
import { env } from "@/lib/env";
import type { paths } from "./schema";

// Server component-ууд API-д дотоод сүлжээний хаягаар (docker) хандаж болно; browser үргэлж нийтийн
// хаягийг ашиглана. `API_INTERNAL_URL` client-д хэзээ ч ил гарахгүй.
export function apiBaseUrl(): string {
  if (typeof window === "undefined" && process.env.API_INTERNAL_URL) {
    return process.env.API_INTERNAL_URL;
  }
  return env.NEXT_PUBLIC_API_URL;
}

type Revalidate = number | false;

/**
 * Үүсгэсэн OpenAPI `paths`-д зориулсан typed client. `revalidate` нь Next.js-ийн fetch cache-ийн
 * насжилт секундээр (зөвхөн server, browser үүнийг тоохгүй). Давтагдсан параметрийг
 * `gender=Men&gender=Unisex` гэж serialize хийдэг, API үүнийг хүлээдэг.
 */
export function createApiClient(revalidate?: Revalidate) {
  return createClient<paths>({
    baseUrl: apiBaseUrl(),
    fetch: (request) =>
      fetch(request, revalidate === undefined ? undefined : { next: { revalidate } }),
  });
}

export type { components } from "./schema";
