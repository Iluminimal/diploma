import { Reveal } from "@/components/motion/reveal";
import { ProductRail } from "@/features/catalog/product-rail";
import { newest } from "./home-data";
import { SectionHeading } from "./section-heading";

/** "New arrivals": the one shelf of products on the page, newest first, in stock. */
export async function NewArrivals() {
  const products = await newest({}, 12);
  if (products.length === 0) return null;
  return (
    <section aria-label="New arrivals" className="container-page defer-render pt-14 pb-4 md:pt-20">
      <Reveal>
        <SectionHeading title="New arrivals" href="/products?sort=newest" linkLabel="Shop all" />
      </Reveal>
      <ProductRail products={products} label="New arrivals" />
    </section>
  );
}
