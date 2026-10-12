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

/** The products this browser looked at last, newest first. Storage can be blocked or tampered with: that just means none. */
export function readRecentlyViewed(): Product[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // The same array until storage changes, as `useSyncExternalStore` requires.
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

/** Remember a product page visit. The photo placeholder is dropped to keep the entry small. */
export function recordView(product: Product): void {
  const entry: Product = { ...product, image: { ...product.image, blur_data_url: null } };
  const next = [entry, ...readRecentlyViewed().filter((p) => p.id !== product.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Not remembering is fine.
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
