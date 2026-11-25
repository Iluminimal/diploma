/**
 * Веб хуудасны аюулгүй толгойнууд. Цэвэр функцүүд (env, header-т хүрэхгүй) тул тестлэхэд амар;
 * `proxy.ts` хүсэлт бүрт CSP-г, `next.config.ts` үлдсэн тогтмол толгойг хэрэглэнэ.
 */

export type CspMode = "enforce" | "report-only";

/** Browser CSP зөрчлийг энд илгээнэ (API руу rewrite хийгддэг, нэг origin). */
export const CSP_REPORT_PATH = "/api/v1/security/csp-report";

/** Prod-д зөрчлийг татгалзана; dev-д (HMR, eval) зөвхөн мэдээлнэ. `CSP_MODE`-оор дарж болно. */
export function resolveCspMode(value: string | undefined, production: boolean): CspMode {
  if (value === "enforce" || value === "report-only") return value;
  return production ? "enforce" : "report-only";
}

export const cspHeaderName = (mode: CspMode) =>
  mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

/** Хүсэлт бүрт шинэ, таамаглагдахгүй nonce (Next өөрийн inline script-үүдэд хэрэглэнэ). */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * Content-Security-Policy. Script нь зөвхөн nonce-той (`strict-dynamic` нь тэднээс ачаалагдсаныг
 * итгэнэ); style нь inline зөвшөөрнө (Tailwind, Next, Radix inline style тавьдаг); зураг нь манай
 * origin, `data:` (blur placeholder), `blob:` (камер, upload урьдчилсан харагдац) ба https
 * (Google профайл зураг). Frame, object, `<base>` бүгд хаалттай. Хайлтын санал, ангиллын мод зэрэг
 * browser-ийн зарим дуудлага API-д шууд хүрдэг (`createApiClient`), тиймээс API-ийн origin
 * (`NEXT_PUBLIC_API_URL`) `connect-src`, `img-src`-д орно.
 */
export function buildCsp({
  nonce,
  development,
  https,
  apiOrigin,
}: {
  nonce: string;
  development: boolean;
  https: boolean;
  /** `https://api.example.com` гэх мэт origin; манай origin-той адил бол нэмэхгүй. */
  apiOrigin?: string;
}): string {
  const api = apiOrigin ? [apiOrigin] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:", ...api],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...api, ...(development ? ["ws:", "wss:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // http дээр (локал production build) upgrade хийвэл бүх хүсэлт https://localhost руу явж унана.
  if (https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/**
 * CSP-ээс бусад тогтмол толгойнууд. HSTS-ийг http дээр browser өөрөө үл тооно, тиймээс зөвхөн
 * production-д нэмнэ (dev-д localhost-д санагдахаас сэргийлнэ).
 */
export function staticSecurityHeaders({ production }: { production: boolean }): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    // Камер зөвхөн зургаар хайхад (энэ origin); бусад мэдрэгч, төлбөрийн API хаалттай.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}
