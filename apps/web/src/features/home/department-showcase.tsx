import Image from "next/image";
import Link from "next/link";
import { categoryHref } from "@/features/catalog/nav";
import type { Product } from "@/features/catalog/product";
import { newest } from "./home-data";
import { SectionHeading } from "./section-heading";

const CARDS = [
  { slug: "women", label: "Women", blurb: "Dresses, tops and everything in between" },
  { slug: "men", label: "Men", blurb: "Shirts, jeans and sharp shoes" },
  { slug: "kids", label: "Kids", blurb: "Easy, bright and built to be worn" },
] as const;

function Card({ card, product, priority }: { card: (typeof CARDS)[number]; product?: Product; priority: boolean }) {
  return (
    <Link
      href={categoryHref(card.slug)}
      className="zoom-in group tile focus-visible:ring-ring/60 flex flex-col text-center outline-none focus-visible:ring-3"
    >
      <div className="px-6 pt-10 md:pt-12">
        <h3 className="type-title">{card.label}</h3>
        <p className="text-muted-foreground type-body mx-auto mt-1 max-w-xs">{card.blurb}</p>
        <span className="link-more mt-3 inline-block">Shop {card.label.toLowerCase()}</span>
      </div>
      <div className="relative mt-6 aspect-4/5 w-full overflow-hidden dark:bg-white">
        {product && (
          <Image
            src={product.image.thumb_800}
            alt=""
            width={800}
            height={1067}
            sizes="(min-width: 768px) 32vw, 100vw"
            priority={priority}
            placeholder={product.image.blur_data_url ? "blur" : "empty"}
            blurDataURL={product.image.blur_data_url ?? undefined}
            className="size-full object-cover object-top mix-blend-multiply transition-transform duration-1000 ease-[var(--ease-out-expo)] group-hover:scale-105 dark:mix-blend-normal"
          />
        )}
      </div>
    </Link>
  );
}

/** Three big departments, like a product line-up: the newest piece of each is the picture. */
export async function DepartmentShowcase() {
  const products = await Promise.all(CARDS.map(async (card) => (await newest({ department: card.slug, category: "apparel" }, 1))[0]));
  return (
    <section aria-label="Departments" className="defer-render">
      <div className="container-page py-12 md:py-16">
        <SectionHeading title="Find your department." />
        <div className="grid gap-3 md:grid-cols-3">
          {CARDS.map((card, i) => (
            <Card key={card.slug} card={card} product={products[i]} priority={false} />
          ))}
        </div>
      </div>
    </section>
  );
}
