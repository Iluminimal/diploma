import Image from "next/image";
import Link from "next/link";
import { ProductRail } from "@/features/catalog/similar-products";
import { listProducts } from "@/features/catalog/api";
import { emptyFilters, toHref, type ListingQuery } from "@/features/catalog/filters";
import { cn } from "@/lib/utils";

function query(patch: Partial<ListingQuery>): ListingQuery {
  return { ...emptyFilters(), page: 1, ...patch };
}

const TILES: { label: string; patch: Partial<ListingQuery> }[] = [
  { label: "Women", patch: { gender: ["Women"], master_category: ["Apparel"], in_stock: true } },
  { label: "Men", patch: { gender: ["Men"], master_category: ["Apparel"], in_stock: true } },
  { label: "Footwear", patch: { master_category: ["Footwear"], in_stock: true } },
  { label: "Accessories", patch: { master_category: ["Accessories"], in_stock: true } },
];

/** One tile per department; the photo is simply the newest in-stock product in it. */
export async function CategoryTiles() {
  const tiles = await Promise.all(
    TILES.map(async (tile) => {
      const q = query(tile.patch);
      const { items } = await listProducts(q, 1);
      return { ...tile, q, product: items[0] };
    }),
  );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {tiles.map((tile, i) => (
        <li key={tile.label}>
          <Link
            href={toHref("/products", { ...tile.q, in_stock: false })}
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
                className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 pt-12 text-lg font-medium text-white">
              {tile.label}
            </span>
          </Link>
        </li>
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
