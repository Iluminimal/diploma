import Image from "next/image";
import Link from "next/link";
import { categoryHref } from "@/features/catalog/nav";
import type { Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";
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
      className={cn(
        "zoom-in group bg-muted focus-visible:ring-ring/60 relative block aspect-4/5 overflow-hidden rounded-[2rem] outline-none focus-visible:ring-3",
      )}
    >
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
          className="size-full object-cover object-top transition-transform duration-1000 ease-[var(--ease-out-expo)] group-hover:scale-105"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-6 pt-24 text-white md:p-9">
        <h3 className="text-3xl font-semibold tracking-tight md:text-4xl">{card.label}</h3>
        <p className="mt-1 max-w-sm text-sm text-white/80 md:text-base">{card.blurb}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium md:text-base">
          Shop {card.label.toLowerCase()} <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">›</span>
        </span>
      </div>
    </Link>
  );
}

/** Three big departments, like a product line-up: the newest piece of each is the picture. */
export async function DepartmentShowcase() {
  const products = await Promise.all(CARDS.map(async (card) => (await newest({ department: card.slug, category: "apparel" }, 1))[0]));
  return (
    <section aria-label="Departments" className="bg-secondary defer-render">
      <div className="container-page py-16 md:py-24">
        <SectionHeading title="Find your department." />
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {CARDS.map((card, i) => (
            <Card key={card.slug} card={card} product={products[i]} priority={false} />
          ))}
        </div>
      </div>
    </section>
  );
}
