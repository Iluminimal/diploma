import createClient from "openapi-fetch";
import { useAuth } from "@/features/auth/auth-store";
import { hasSessionCookie, refreshSession } from "@/features/auth/session";
import { errorFromBody, networkError } from "./errors";
import type { paths } from "./schema";

/**
 * Same-origin: `next.config.ts` /api/v1-ийг API руу proxy хийдэг тул refresh cookie first-party.
 */
function baseUrl(): string {
  return typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;
}

function withToken(request: Request): Request {
  const token = useAuth.getState().accessToken;
  if (token) request.headers.set("Authorization", `Bearer ${token}`);
  return request;
}

/** Bearer token нэмнэ; 401 ирвэл session-ийг нэг удаа refresh хийж хүсэлтийг давтана. */
async function authedFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await fetch(withToken(request));
  const isAuthEndpoint = new URL(request.url).pathname.startsWith(
    "/api/v1/auth/",
  );
  if (response.status !== 401 || isAuthEndpoint) return response;
  if (!useAuth.getState().accessToken && !hasSessionCookie()) return response; // энгийн зочин
  return (await refreshSession()) ? fetch(withToken(retry)) : response;
}

let client: ReturnType<typeof createClient<paths>> | undefined;

/** Үүсгэсэн OpenAPI paths-д зориулсан typed client, session хэрэгтэй browser код-д. */
export function browserApi() {
  client ??= createClient<paths>({ baseUrl: baseUrl(), fetch: authedFetch });
  return client;
}

/**
 * openapi-fetch дуудлагыг хүлээж, data-г нь буцаана эсвэл `ApiError` шиднэ (offline бол status 0).
 */
export async function call<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result;
  try {
    result = await request;
  } catch (cause) {
    throw networkError(cause);
  }
  if (!result.response.ok) throw errorFromBody(result.error, result.response);
  return result.data as T;
}
