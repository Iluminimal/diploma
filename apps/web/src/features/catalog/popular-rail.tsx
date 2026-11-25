import { getTranslations } from "next-intl/server";
import { listProducts } from "./api";
import { emptyFilters } from "./filters";
import { ProductRail } from "./product-rail";

/**
 * "Хамгийн их зарагдсан": хоосон үр дүн, хоосон сагсанд зам тасрахгүйн тулд харуулна. API унасан бол
 * юу ч харуулахгүй (энэ нь зөвхөн нэмэлт санал).
 */
export async function PopularRail({ count = 8 }: { count?: number }) {
  const [page, t] = await Promise.all([
    listProducts({ ...emptyFilters(), sort: "popular", page: 1 }, count).catch(() => null),
    getTranslations("catalog"),
  ]);
  if (!page || page.items.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby="popular-heading">
      <h2 id="popular-heading" className="type-heading mb-5">
        {t("bestSellers")}
      </h2>
      <ProductRail products={page.items} label={t("bestSellers")} />
    </section>
  );
}
