import type { components } from "./schema";

type ProblemDetail = components["schemas"]["ProblemDetail"];

const TYPE = {
  rateLimited: "urn:angel:problem:rate-limited",
  tooLarge: "urn:angel:problem:upload-too-large",
  unsupported: "urn:angel:problem:unsupported-media-type",
  invalidImage: "urn:angel:problem:invalid-image",
  productNotFound: "urn:angel:problem:product-not-found",
  invalidCredentials: "urn:angel:problem:invalid-credentials",
  emailTaken: "urn:angel:problem:email-taken",
  unauthenticated: "urn:angel:problem:unauthenticated",
  insufficientStock: "urn:angel:problem:insufficient-stock",
  cartEmpty: "urn:angel:problem:cart-empty",
  invalidSize: "urn:angel:problem:invalid-size",
  paymentsUnavailable: "urn:angel:problem:payments-unavailable",
  paymentProvider: "urn:angel:problem:payment-provider-error",
  paymentInProgress: "urn:angel:problem:payment-in-progress",
  forbiddenOrigin: "urn:angel:problem:forbidden-origin",
  forbidden: "urn:angel:problem:forbidden",
  invalidCategory: "urn:angel:problem:invalid-category",
} as const;

/** An RFC 7807 problem returned by the API, or a transport failure (`status` 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;
  /** Seconds to wait before retrying (429 only). */
  readonly retryAfter: number | undefined;

  constructor(init: {
    status: number;
    title: string;
    type?: string;
    detail?: string | null;
    requestId?: string | null;
    retryAfter?: number;
  }) {
    super(init.title);
    this.name = "ApiError";
    this.status = init.status;
    this.type = init.type ?? "about:blank";
    this.detail = init.detail ?? undefined;
    this.requestId = init.requestId ?? undefined;
    this.retryAfter = init.retryAfter;
  }

  /** Extra members of the problem body (e.g. `available`, `issues`, `sizes`). */
  extensions: Record<string, unknown> = {};

  get isNotFound() {
    return this.status === 404;
  }

  is(type: keyof typeof TYPE) {
    return this.type === TYPE[type];
  }
}

function parseProblem(body: unknown): Partial<ProblemDetail> {
  if (body && typeof body === "object" && "title" in body && "status" in body) {
    return body as Partial<ProblemDetail>;
  }
  return {};
}

/** Build an `ApiError` from an already-parsed error body (what openapi-fetch hands back). */
export function errorFromBody(body: unknown, response: Response): ApiError {
  const problem = parseProblem(body);
  const retryAfter = Number(response.headers.get("Retry-After"));
  const error = new ApiError({
    status: response.status,
    title: problem.title ?? (response.statusText || "Request failed"),
    type: problem.type,
    detail: problem.detail,
    requestId: problem.request_id,
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
  if (body && typeof body === "object") error.extensions = body as Record<string, unknown>;
  return error;
}

/** Build an `ApiError` from a non-2xx response. Never throws; unknown bodies fall back to the status. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  const problem = parseProblem(await response.json().catch(() => null));
  const retryAfter = Number(response.headers.get("Retry-After"));
  return new ApiError({
    status: response.status,
    title: problem.title ?? (response.statusText || "Request failed"),
    type: problem.type,
    detail: problem.detail,
    requestId: problem.request_id,
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

/** Convert any thrown value to a message that is safe and useful to show a shopper. */
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }
  switch (true) {
    case error.is("invalidCredentials"):
      return "That email and password don't match. Please try again.";
    case error.is("emailTaken"):
      return "An account with this email already exists. Try signing in instead.";
    case error.is("unauthenticated") || error.status === 401:
      return "Please sign in to continue.";
    case error.is("insufficientStock"):
      return error.detail ?? "Not enough stock for that quantity.";
    case error.is("cartEmpty"):
      return "Your cart is empty.";
    case error.is("paymentsUnavailable"):
      return "Payments aren't available right now. Please try again later.";
    case error.is("paymentProvider"):
      return "We couldn't reach the payment provider. Your cart is unchanged, please try again.";
    case error.is("paymentInProgress"):
      return error.detail ?? "A payment is already in progress for your last order.";
    case error.is("forbiddenOrigin"):
      return "This request was blocked for your safety. Reload the page and try again.";
    case error.is("forbidden") || error.status === 403:
      return "Your account isn't allowed to do that.";
    case error.is("invalidCategory"):
      return error.detail ?? "Choose a valid category.";
    case error.status === 0:
      return "We can't reach the server. Check your connection and try again.";
    case error.type === TYPE.rateLimited || error.status === 429:
      return error.retryAfter
        ? `Too many requests. Try again in ${error.retryAfter} seconds.`
        : "Too many requests. Please wait a moment and try again.";
    case error.type === TYPE.tooLarge || error.status === 413:
      return "That image is too large. Please use one under 8 MB.";
    case error.type === TYPE.unsupported || error.status === 415:
      return "Unsupported file type. Please use a JPEG, PNG or WebP image.";
    case error.type === TYPE.invalidImage:
      return "We couldn't read that image. Try a different photo.";
    case error.status === 422:
      return error.detail ?? "Please check the details you entered.";
    case error.status === 404:
      return "We couldn't find that.";
    case error.status >= 500:
      return "Our server had a problem. Please try again shortly.";
    default:
      return error.detail ?? "Something went wrong. Please try again.";
  }
}

/** Wrap a network failure (fetch rejected) as an `ApiError` with status 0. */
export function networkError(cause: unknown): ApiError {
  if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
  const error = new ApiError({ status: 0, title: "Network error" });
  error.cause = cause; // kept for server logs; never shown to shoppers
  return error;
}
