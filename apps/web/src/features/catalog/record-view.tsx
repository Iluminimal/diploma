"use client";

import { useEffect } from "react";
import { recordView } from "./recently-viewed";
import type { Product } from "./product";

/** Renders nothing; remembers that this product page was opened (for "Recently viewed" on the home page). */
export function RecordView({ product }: { product: Product }) {
  useEffect(() => {
    recordView(product);
  }, [product]);
  return null;
}
