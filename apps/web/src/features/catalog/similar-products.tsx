import { getSimilarProducts } from "./api";
import { ProductRail } from "./product-rail";

/** Visually similar products from the stored embedding (no model inference on the API side). */
export async function SimilarProducts({ productId }: { productId: number }) {
  const { results } = await getSimilarProducts(productId, 12);
  if (results.length === 0) return null;
  return (
    <section aria-labelledby="similar-heading" className="defer-render mt-20">
      <h2 id="similar-heading" className="mb-6 text-xl font-semibold tracking-tight">
        You may also like
      </h2>
      <ProductRail products={results.map((r) => r.product)} label="Similar products" />
    </section>
  );
}
