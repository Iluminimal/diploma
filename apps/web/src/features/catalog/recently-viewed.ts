import type { Product } from "./product";

const KEY = "angel:recently-viewed";
const MAX = 12;
const EVENT = "angel:recently-viewed-changed";

const EMPTY: Product[] = [];
let cache: { raw: string | null; items: Product[] } = { raw: null, items: EMPTY };

function isProduct(value: unknown): value is Product {
  const p = value as Partial<Product> | null;
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.id === "number" &&
    typeof p.slug === "string" &&
    typeof p.name === "string" &&
    typeof p.price_cents === "number" &&
    typeof p.image?.thumb_400 === "string"
  );
}

/**
 * Энэ browser-ийн сүүлд үзсэн бүтээгдэхүүн, шинэ нь түрүүнд. Storage хаалттай эсвэл өөрчлөгдсөн
 * байж болно: тэгвэл хоосон.
 */
export function readRecentlyViewed(): Product[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // Storage өөрчлөгдөх хүртэл ижил массив, `useSyncExternalStore` шаарддаг.
  if (raw === cache.raw) return cache.items;
  let items: Product[] = EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) items = parsed.filter(isProduct).slice(0, MAX);
  } catch {
    items = EMPTY;
  }
  cache = { raw, items };
  return items;
}

/**
 * Бүтээгдэхүүний хуудас үзсэнийг санана. Бичлэг жижиг байлгахын тулд зургийн placeholder-ыг хасна.
 */
export function recordView(product: Product): void {
  const entry: Product = { ...product, image: { ...product.image, blur_data_url: null } };
  const next = [entry, ...readRecentlyViewed().filter((p) => p.id !== product.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Санахгүй байсан ч зүгээр.
  }
}

export function subscribeToRecentlyViewed(notify: () => void): () => void {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

export const recentlyViewedOnServer = (): Product[] => EMPTY;
