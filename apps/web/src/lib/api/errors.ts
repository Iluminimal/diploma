import type { components } from "./schema";

type ProblemDetail = components["schemas"]["ProblemDetail"];

const TYPE = {
  rateLimited: "urn:lookalike:problem:rate-limited",
  tooLarge: "urn:lookalike:problem:upload-too-large",
  unsupported: "urn:lookalike:problem:unsupported-media-type",
  invalidImage: "urn:lookalike:problem:invalid-image",
  productNotFound: "urn:lookalike:problem:product-not-found",
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

  get isNotFound() {
    return this.status === 404;
  }
}

function parseProblem(body: unknown): Partial<ProblemDetail> {
  if (body && typeof body === "object" && "title" in body && "status" in body) {
    return body as Partial<ProblemDetail>;
  }
  return {};
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
    case error.status === 0:
      return "We can't reach the server. Check your connection and try again.";
    case error.type === TYPE.rateLimited || error.status === 429:
      return error.retryAfter
        ? `Too many searches. Try again in ${error.retryAfter} seconds.`
        : "Too many searches. Please wait a moment and try again.";
    case error.type === TYPE.tooLarge || error.status === 413:
      return "That image is too large. Please use one under 8 MB.";
    case error.type === TYPE.unsupported || error.status === 415:
      return "Unsupported file type. Please use a JPEG, PNG or WebP image.";
    case error.type === TYPE.invalidImage || error.status === 422:
      return "We couldn't read that image. Try a different photo.";
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
