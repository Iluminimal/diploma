import { ProductCard, ProductCardSkeleton } from "@/components/product-card";
import { RailItem, ScrollRail } from "@/components/scroll-rail";
import { getSimilarProducts } from "./api";
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

/** Visually similar products from the stored embedding (no model inference on the API side). */
export async function SimilarProducts({ productId }: { productId: number }) {
  const { results } = await getSimilarProducts(productId, 12);
  if (results.length === 0) return null;
  return (
    <section aria-labelledby="similar-heading" className="mt-20">
      <h2 id="similar-heading" className="mb-6 text-xl font-semibold tracking-tight">
        You may also like
      </h2>
      <ProductRail products={results.map((r) => r.product)} label="Similar products" />
    </section>
  );
}
