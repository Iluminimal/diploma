/**
 * Нэвтэрсний дараа хаашаа очих вэ. Зөвхөн ижил сайтын зам зөвшөөрнө: `?next=https://evil.example`
 * эсвэл `//evil.example` нь login хуудсыг open redirect болгож болохгүй.
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
