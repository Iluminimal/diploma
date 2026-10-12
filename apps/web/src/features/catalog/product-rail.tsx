import { ProductCard, ProductCardSkeleton } from "@/components/product/product-card";
import { RailItem, ScrollRail } from "@/components/product/scroll-rail";
import type { Product } from "./product";

const RAIL_SIZES = "(min-width: 1024px) 240px, (min-width: 640px) 208px, 44vw";

export function ProductRail({ products, label }: { products: Product[]; label: string }) {
  return (
    <ScrollRail label={label}>
      {products.map((product) => (
        <RailItem key={product.id}>
          <ProductCard product={product} sizes={RAIL_SIZES} />
        </RailItem>
      ))}
    </ScrollRail>
  );
}

export function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden sm:gap-5" role="status" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="w-[44vw] max-w-56 shrink-0 sm:w-52 lg:w-60">
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  );
}

