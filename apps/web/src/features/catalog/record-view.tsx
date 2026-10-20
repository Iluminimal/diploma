"use client";

import { useEffect } from "react";
import { recordView } from "./recently-viewed";
import type { Product } from "./product";

/**
 * Юу ч зурахгүй; энэ бүтээгдэхүүний хуудас нээгдсэнийг санана (нүүр хуудасны "Recently viewed"-д).
 */
export function RecordView({ product }: { product: Product }) {
  useEffect(() => {
    recordView(product);
  }, [product]);
  return null;
}
