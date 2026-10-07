import createClient from "openapi-fetch";
import { env } from "@/lib/env";
import type { paths } from "./schema";

// Server components may reach the API over an internal network address (docker);
// the browser always uses the public one. `API_INTERNAL_URL` is never exposed to the client.
export function apiBaseUrl(): string {
  if (typeof window === "undefined" && process.env.API_INTERNAL_URL) {
    return process.env.API_INTERNAL_URL;
  }
  return env.NEXT_PUBLIC_API_URL;
}

type Revalidate = number | false;

/**
 * Typed client for the generated OpenAPI `paths`. `revalidate` is Next.js' fetch cache lifetime
 * in seconds (server only; ignored by browsers). Repeated parameters are serialized as
 * `gender=Men&gender=Unisex`, which is what the API expects.
 */
export function createApiClient(revalidate?: Revalidate) {
  return createClient<paths>({
    baseUrl: apiBaseUrl(),
    fetch: (request) =>
      fetch(request, revalidate === undefined ? undefined : { next: { revalidate } }),
  });
}

export type { components } from "./schema";
