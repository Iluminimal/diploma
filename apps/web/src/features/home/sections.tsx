import Image from "next/image";
import { Reveal } from "@/components/motion/reveal";
import Link from "next/link";
import { ProductRail } from "@/features/catalog/similar-products";
import { listProducts } from "@/features/catalog/api";
import { emptyFilters, type ListingQuery } from "@/features/catalog/filters";
import { categoryHref } from "@/features/catalog/nav";
import { cn } from "@/lib/utils";

function query(patch: Partial<ListingQuery>): ListingQuery {
  return { ...emptyFilters(), page: 1, in_stock: true, ...patch };
}

const TILES: { label: string; href: string; patch: Partial<ListingQuery> }[] = [
  { label: "Women", href: categoryHref("women"), patch: { department: "women", category: "apparel" } },
  { label: "Men", href: categoryHref("men"), patch: { department: "men", category: "apparel" } },
  { label: "Kids", href: categoryHref("kids"), patch: { department: "kids", category: "apparel" } },
  { label: "Accessories", href: "/products?master_category=Accessories", patch: { category: "accessories" } },
];

/** One tile per department; the photo is simply the newest in-stock product in it. */
export async function CategoryTiles() {
  const tiles = await Promise.all(
    TILES.map(async (tile) => {
      const { items } = await listProducts(query(tile.patch), 1);
      return { ...tile, product: items[0] };
    }),
  );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {tiles.map((tile, i) => (
        <Reveal as="li" key={tile.label} delay={i * 0.07} y={22}>
          <Link
            href={tile.href}
            className="group focus-visible:ring-ring/60 bg-muted relative block aspect-[4/5] overflow-hidden rounded-3xl outline-none focus-visible:ring-3"
          >
            {tile.product && (
              <Image
                src={tile.product.image.thumb_800}
                alt=""
                width={800}
                height={1067}
                sizes="(min-width: 1024px) 25vw, 50vw"
                priority={i < 2}
                fetchPriority={i < 2 ? "high" : undefined}
                placeholder={tile.product.image.blur_data_url ? "blur" : "empty"}
                blurDataURL={tile.product.image.blur_data_url ?? undefined}
                className="size-full object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-105"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 pt-12 text-lg font-medium text-white">
              {tile.label}
            </span>
          </Link>
        </Reveal>
      ))}
    </ul>
  );
}

/** "New arrivals" = most recently added to the catalogue (the dataset has no release dates). */
export async function NewArrivals() {
  const { items } = await listProducts({ ...emptyFilters(), in_stock: true, sort: "newest", page: 1 }, 12);
  return <ProductRail products={items} label="New arrivals" />;
}

export function SectionHeading({
  title,
  href,
  linkLabel,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-4", className)}>
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
      {href && (
        <Link href={href} className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline">
          {linkLabel ?? "View all"}
        </Link>
      )}
    </div>
  );
}
