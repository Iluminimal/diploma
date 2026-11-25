import { getTranslations } from "next-intl/server";
import { getSimilarProducts } from "./api";
import { SimilarRefine } from "./similar-refine";

/** Хадгалсан embedding-ээс харагдацаараа төстэй бүтээгдэхүүн (API талд model inference хийхгүй). */
export async function SimilarProducts({ productId }: { productId: number }) {
  const t = await getTranslations("catalog");
  // Төстэй барааны endpoint унасан ч бүтээгдэхүүний хуудас унахгүй: энэ хэсгийг л нууна.
  const similar = await getSimilarProducts(productId, 12).catch(() => null);
  const results = similar?.results ?? [];
  if (results.length === 0) return null;
  return (
    <section aria-labelledby="similar-heading" className="defer-render mt-20">
      <h2 id="similar-heading" className="type-title mb-6 md:mb-8">
        {t("youMayAlsoLike")}
      </h2>
      <SimilarRefine productId={productId} initial={results.map((r) => r.product)} label={t("similarProducts")} />
    </section>
  );
}
