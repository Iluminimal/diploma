import { getTranslations } from "next-intl/server";
import { getCompleteTheLook } from "./api";
import { ProductRail } from "./product-rail";

/**
 * Энэ бараатай хамт өмсөх бараа (бусад ангиллаас). Endpoint унасан эсвэл юу ч олдохгүй бол хэсгийг
 * нууна: бүтээгдэхүүний хуудас үүнээс хамаарахгүй.
 */
export async function CompleteTheLook({ productId }: { productId: number }) {
  const [items, t] = await Promise.all([
    getCompleteTheLook(productId, 8).catch(() => []),
    getTranslations("catalog"),
  ]);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="look-heading" className="defer-render mt-20">
      <h2 id="look-heading" className="type-title mb-6 md:mb-8">
        {t("completeTheLook")}
      </h2>
      <ProductRail products={items} label={t("completeTheLook")} />
    </section>
  );
}
