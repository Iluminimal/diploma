import { env } from "@/lib/env";

const MEDIA_PREFIX = `${env.NEXT_PUBLIC_API_URL}/media/`;

/**
 * API каталогийн зураг бүрийг 400 ба 800 px WebP-ээр (`..._400.webp`, `..._800.webp`) аль хэдийн
 * үйлчилдэг тул Next-ийн optimizer зөвхөн дахин encode хийх байсан (мөн `localhost` эх сурвалжаас
 * татгалздаг). Энэ loader хүссэн өргөнд хамгийн ойр урьдчилан гаргасан хэмжээг сонгож, энэ сайтын
 * өөрийн `/media` route-оор (`next.config.ts`-ыг үз) татна: хоёр дахь origin нь эхний зургийн byte
 * ирэхээс өмнө DNS lookup, TCP handshake, хүйтэн congestion window-д зарцуулдаг, хуудасны largest
 * paint яг үүнийг хүлээж байдаг.
 */
export default function imageLoader({ src, width }: { src: string; width: number }): string {
  const sized = width > 400 ? src.replace(/_400\.webp$/, "_800.webp") : src.replace(/_800\.webp$/, "_400.webp");
  return sized.startsWith(MEDIA_PREFIX) ? sized.slice(env.NEXT_PUBLIC_API_URL.length) : sized;
}
