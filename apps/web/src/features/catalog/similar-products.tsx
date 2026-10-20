import { getSimilarProducts } from "./api";
import { ProductRail } from "./product-rail";

/** Хадгалсан embedding-ээс харагдацаараа төстэй бүтээгдэхүүн (API талд model inference хийхгүй). */
export async function SimilarProducts({ productId }: { productId: number }) {
  const { results } = await getSimilarProducts(productId, 12);
  if (results.length === 0) return null;
  return (
    <section aria-labelledby="similar-heading" className="defer-render mt-20">
      <h2 id="similar-heading" className="type-title mb-6 md:mb-8">
        You may also like
      </h2>
      <ProductRail products={results.map((r) => r.product)} label="Similar products" />
    </section>
  );
}
