/**
 * Where to go after signing in. Only same-site paths are allowed: `?next=https://evil.example`
 * or `//evil.example` must never turn the login page into an open redirect.
 */
export function safeNext(
  raw: string | string[] | undefined,
  fallback = "/",
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return fallback;
  if (/^\/(login|register)(\/|\?|$)/.test(value)) return fallback;
  return value;
}
