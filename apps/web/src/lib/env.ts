/**
 * Public settings, checked once at start-up so a wrong address fails loudly instead of putting a
 * wrong URL into canonical links, Open Graph tags and the sitemap. Deliberately plain TypeScript:
 * this module is imported by browser code, and a validation library would ship to every visitor
 * to check two strings.
 */

function publicUrl(name: string, value: string | undefined, fallback: string): string {
  const url = value || fallback;
  try {
    const { protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") throw new Error("not http(s)");
  } catch {
    throw new Error(`${name} must be a full http(s) URL such as ${fallback}, got "${url}"`);
  }
  return url.replace(/\/+$/, "");
}

// Next.js only inlines NEXT_PUBLIC_* variables referenced statically, so each
// one must be listed here explicitly rather than passing `process.env` whole.
export const env = {
  NEXT_PUBLIC_API_URL: publicUrl("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL, "http://localhost:8000"),
  NEXT_PUBLIC_SITE_URL: publicUrl("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000"),
};
