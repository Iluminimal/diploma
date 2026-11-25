import type { Product } from "@/features/catalog/product";

const KEY = "angel:pending-wishlist";

/**
 * Зочин зүрх дарсан бараа: нэвтрэх хуудас руу явахад хадгалж, нэвтэрсний дараа автоматаар хадгална
 * (`PendingWishlistReplay`). sessionStorage: энэ табдаа л, хаахад алга болно. Хаа ч хадгалах боломжгүй
 * (private горим) бол чимээгүй алгасна.
 */
export function rememberPendingWishlist(product: Product): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(product));
  } catch {
    // хадгалж чадахгүй: зүгээр л нэвтэрсний дараа дахин дарна.
  }
}

/** Хадгалсан барааг нэг удаа авч, устгана. */
export function takePendingWishlist(): Product | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const product = JSON.parse(raw) as Product;
    return typeof product?.id === "number" ? product : null;
  } catch {
    return null;
  }
}
