import { env } from "@/lib/env";

const MEDIA_PREFIX = `${env.NEXT_PUBLIC_API_URL}/media/`;

/**
 * The API already serves every catalogue photo as WebP at 400 and 800 px (`..._400.webp`,
 * `..._800.webp`), so Next's optimizer would only re-encode them (and refuses `localhost`
 * sources). This loader picks the closest pre-generated size for the requested width and fetches
 * it through this site's own `/media` route (see `next.config.ts`): a second origin costs a DNS
 * lookup, a TCP handshake and a cold congestion window before the first image byte, which is
 * exactly what the largest paint on a page is waiting for.
 */
export default function imageLoader({ src, width }: { src: string; width: number }): string {
  const sized = width > 400 ? src.replace(/_400\.webp$/, "_800.webp") : src.replace(/_800\.webp$/, "_400.webp");
  return sized.startsWith(MEDIA_PREFIX) ? sized.slice(env.NEXT_PUBLIC_API_URL.length) : sized;
}
