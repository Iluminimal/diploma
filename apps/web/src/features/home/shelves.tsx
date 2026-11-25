import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/motion/reveal";
import { ProductRail } from "@/features/catalog/product-rail";
import { newest, popular } from "./home-data";
import { SectionHeading } from "./section-heading";

/** "Popular": хамгийн эрэлттэй нь, hero-ийн дараа шууд. */
export async function PopularNow() {
  const [products, t] = await Promise.all([popular({}, 12), getTranslations("home")]);
  if (products.length === 0) return null;
  return (
    <section aria-label={t("popular")} className="container-page pt-14 pb-4 md:pt-20">
      <Reveal>
        <SectionHeading title={t("popular")} href="/products?sort=popular" linkLabel={t("shopAll")} />
      </Reveal>
      <ProductRail products={products} label={t("popular")} />
    </section>
  );
}

/** "New arrivals": шинэ нь түрүүнд, нөөцөд байгаа. */
export async function NewArrivals() {
  const [products, t] = await Promise.all([newest({}, 12), getTranslations("home")]);
  if (products.length === 0) return null;
  return (
    <section aria-label={t("newArrivals")} className="container-page defer-render pt-14 pb-4 md:pt-20">
      <Reveal>
        <SectionHeading title={t("newArrivals")} href="/products?sort=newest" linkLabel={t("shopAll")} />
      </Reveal>
      <ProductRail products={products} label={t("newArrivals")} />
    </section>
  );
}
