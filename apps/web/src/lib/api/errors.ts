import { createTranslator } from "next-intl";
import en from "../../../messages/en";
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
  otpInvalid: "urn:angel:problem:otp-invalid",
  weakPassword: "urn:angel:problem:weak-password",
  otpExpired: "urn:angel:problem:otp-expired",
  otpTooManyAttempts: "urn:angel:problem:otp-too-many-attempts",
  phoneTaken: "urn:angel:problem:phone-taken",
  lastSignInMethod: "urn:angel:problem:last-sign-in-method",
  invalidDestination: "urn:angel:problem:invalid-destination",
  smsUnavailable: "urn:angel:problem:sms-unavailable",
  emailUnavailable: "urn:angel:problem:email-unavailable",
  contactEmailRequired: "urn:angel:problem:contact-email-required",
  wishlistFull: "urn:angel:problem:wishlist-full",
  cartFull: "urn:angel:problem:cart-full",
  addressLimit: "urn:angel:problem:address-limit",
  checkoutBusy: "urn:angel:problem:checkout-busy",
  reviewExists: "urn:angel:problem:review-exists",
  invalidTransition: "urn:angel:problem:invalid-order-transition",
  // Ижил түлхүүрээр давтсан checkout, гэхдээ захиалга хугацаа нь дууссан (409).
  attemptExpired: "urn:angel:problem:attempt-expired",
} as const;

/** API-ийн буцаасан RFC 7807 problem, эсвэл дамжуулалтын алдаа (`status` 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;
  /** Дахин оролдохоос өмнө хүлээх секунд (зөвхөн 429). */
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

  /** Problem body-ийн нэмэлт гишүүд (жишээ нь `available`, `issues`, `sizes`). */
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

/** Аль хэдийн parse хийсэн алдааны body-оос `ApiError` үүсгэнэ (openapi-fetch өгдөг зүйл). */
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

/**
 * 2xx биш response-оос `ApiError` үүсгэнэ. Хэзээ ч throw хийхгүй; үл мэдэгдэх body нь status руу
 * буцна.
 */
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

/** `errors` namespace-ийн орчуулагч: `useTranslations("errors")` эсвэл `createTranslator`. */
export type ErrorTranslator = (key: keyof typeof en.errors, values?: Record<string, string | number>) => string;

/**
 * Шидэгдсэн дурын утгыг худалдан авагчид харуулахад аюулгүй, хэрэгтэй мессеж болгон хөрвүүлэх функц
 * үүсгэнэ. Тодорхой төрөлтэй алдаа орчуулсан мессежээ авна; серверийн англи `detail` зөвхөн төрөл нь
 * үл мэдэгдэх (422, ерөнхий) үед л дамжина.
 */
export function createUserMessage(t: ErrorTranslator) {
  return (error: unknown): string => {
    if (!(error instanceof ApiError)) return t("generic");
    switch (true) {
      case error.is("invalidCredentials"):
        return t("invalidCredentials");
      case error.is("emailTaken"):
        return t("emailTaken");
      case error.is("otpInvalid"):
        return t("otpInvalid");
      case error.is("weakPassword"):
        return t(
          error.extensions.reason === "contains_identity"
            ? "weakPasswordIdentity"
            : error.extensions.reason === "repeated"
              ? "weakPasswordRepeated"
              : "weakPasswordCommon",
        );
      case error.is("otpExpired"):
        return t("otpExpired");
      case error.is("otpTooManyAttempts"):
        return t("otpTooManyAttempts");
      case error.is("phoneTaken"):
        return t("phoneTaken");
      case error.is("lastSignInMethod"):
        return t("lastSignInMethod");
      case error.is("invalidDestination"):
        return t("invalidDestination");
      case error.is("smsUnavailable"):
        return t("smsUnavailable");
      case error.is("emailUnavailable"):
        return t("emailUnavailable");
      case error.is("contactEmailRequired"):
        return t("contactEmailRequired");
      case error.is("wishlistFull"):
        return t("wishlistFull");
      case error.is("cartFull"):
        return t("cartFull");
      case error.is("addressLimit"):
        return t("addressLimit");
      case error.is("checkoutBusy"):
        return t("checkoutBusy");
      case error.is("reviewExists"):
        return t("reviewExists");
      case error.is("invalidTransition"):
        return t("invalidTransition");
      case error.is("invalidSize"):
        return t("invalidSize");
      case error.is("unauthenticated") || error.status === 401:
        return t("unauthenticated");
      case error.is("insufficientStock"): {
        const available = error.extensions.available;
        if (available === 0) return t("soldOut");
        return typeof available === "number" ? t("onlyAvailable", { available }) : t("insufficientStock");
      }
      case error.is("cartEmpty"):
        return t("cartEmpty");
      case error.is("paymentsUnavailable"):
        return t("paymentsUnavailable");
      case error.is("paymentProvider"):
        return t("paymentProvider");
      case error.is("paymentInProgress"):
        return t("paymentInProgress");
      case error.is("attemptExpired"):
        return t("attemptExpired");
      case error.is("forbiddenOrigin"):
        return t("forbiddenOrigin");
      case error.is("forbidden") || error.status === 403:
        return t("forbidden");
      case error.is("invalidCategory"):
        return t("invalidCategory");
      case error.status === 0:
        return t("network");
      case error.type === TYPE.rateLimited || error.status === 429:
        return error.retryAfter ? t("rateLimitedAfter", { seconds: error.retryAfter }) : t("rateLimited");
      case error.type === TYPE.tooLarge || error.status === 413:
        return t("tooLarge");
      case error.type === TYPE.unsupported || error.status === 415:
        return t("unsupported");
      case error.type === TYPE.invalidImage:
        return t("invalidImage");
      case error.status === 422:
        return error.detail ?? t("validation");
      case error.status === 404:
        return t("notFound");
      case error.status >= 500:
        return t("server");
      default:
        return error.detail ?? t("generic");
    }
  };
}

/** Англи хэлээр. Admin (англиар үлдэнэ) болон хэлний контекстгүй газарт; storefront `useUserMessage`-ийг ашиглана. */
export const userMessage = createUserMessage(
  createTranslator({ locale: "en", messages: en, namespace: "errors" }) as unknown as ErrorTranslator,
);

/** Сүлжээний алдааг (fetch reject) status 0-тэй `ApiError` болгож боож өгнө. */
export function networkError(cause: unknown): ApiError {
  if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
  const error = new ApiError({ status: 0, title: "Network error" });
  error.cause = cause; // server лог-д хадгална; худалдан авагчид хэзээ ч харуулахгүй
  return error;
}
