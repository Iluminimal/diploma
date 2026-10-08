import createClient from "openapi-fetch";
import { useAuth } from "@/features/auth/auth-store";
import { hasSessionCookie, refreshSession } from "@/features/auth/session";
import { errorFromBody, networkError } from "./errors";
import type { paths } from "./schema";

/** Same-origin: `next.config.ts` proxies /api/v1 to the API, so the refresh cookie is first-party. */
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

/** Adds the bearer token; on a 401 it refreshes the session once and repeats the request. */
async function authedFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await fetch(withToken(request));
  const isAuthEndpoint = new URL(request.url).pathname.startsWith(
    "/api/v1/auth/",
  );
  if (response.status !== 401 || isAuthEndpoint) return response;
  if (!useAuth.getState().accessToken && !hasSessionCookie()) return response; // a plain guest
  return (await refreshSession()) ? fetch(withToken(retry)) : response;
}

let client: ReturnType<typeof createClient<paths>> | undefined;

/** Typed client for the generated OpenAPI paths, for browser code that needs the session. */
export function browserApi() {
  client ??= createClient<paths>({ baseUrl: baseUrl(), fetch: authedFetch });
  return client;
}

/** Await an openapi-fetch call; resolve with its data or throw an `ApiError` (status 0 offline). */
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
