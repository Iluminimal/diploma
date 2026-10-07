// The API already serves every catalogue photo as WebP at 400 and 800 px (`..._400.webp`,
// `..._800.webp`), so Next's optimizer would only re-encode them (and refuses `localhost`
// sources). This loader just picks the closest pre-generated size for the requested width.
export default function imageLoader({ src, width }: { src: string; width: number }): string {
  return width > 400 ? src.replace(/_400\.webp$/, "_800.webp") : src.replace(/_800\.webp$/, "_400.webp");
}
