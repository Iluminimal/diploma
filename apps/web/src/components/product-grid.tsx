import type { ReactNode } from "react";
import { ProductCard, ProductCardSkeleton } from "@/components/product-card";
import type { Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:gap-x-6";

export function ProductGrid({
  products,
  columns = 4,
  priorityCount = 4,
  headingLevel = 2,
  className,
}: {
  products: Product[];
  columns?: 3 | 4;
  priorityCount?: number;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  return (
    <ul className={cn(GRID, columns === 4 && "lg:grid-cols-4", className)}>
      {products.map((product, i) => (
        // Rows below the first screen are not rendered (or their photos fetched) until needed.
        <li key={product.id} className={i >= priorityCount + 3 ? "defer-render [contain-intrinsic-size:auto_380px]" : undefined}>
          <ProductCard product={product} priority={i < priorityCount} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({
  count = 8,
  columns = 4,
}: {
  count?: number;
  columns?: 3 | 4;
}): ReactNode {
  return (
    <div
      className={cn(GRID, columns === 4 && "lg:grid-cols-4")}
      role="status"
      aria-label="Loading products"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
