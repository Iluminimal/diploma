import Link from "next/link";
import type { ReactNode } from "react";
import { ProductImage } from "@/components/product-image";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import { formatPrice, productPath, productSubtitle, type Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

type Props = {
  product: Product;
  sizes?: string;
  priority?: boolean;
  /** Overlay in the image's top-left corner (e.g. similarity badge). */
  badge?: ReactNode;
  /** Heading level of the product name: 2 directly under the page's h1, 3 under a section heading. */
  headingLevel?: 2 | 3;
  className?: string;
};

export const GRID_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

export function ProductCard({ product, sizes = GRID_SIZES, priority, badge, headingLevel = 3, className }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={cn("group relative", className)}>
      <Link
        href={productPath(product)}
        className="focus-visible:ring-ring/60 block rounded-2xl outline-none focus-visible:ring-3"
      >
        <div className="bg-muted relative aspect-3/4 overflow-hidden rounded-2xl">
          <ProductImage
            product={product}
            sizes={sizes}
            priority={priority}
            className="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          {!product.in_stock && (
            <span className="bg-background/90 text-foreground absolute right-2 bottom-2 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur">
              Sold out
            </span>
          )}
        </div>
        <div className="mt-3 space-y-0.5 px-0.5">
          <Heading className="line-clamp-2 text-sm leading-snug font-medium">{product.name}</Heading>
          <p className="text-muted-foreground truncate text-xs">{productSubtitle(product)}</p>
          <p className="pt-1 text-sm font-medium tabular-nums">
            {formatPrice(product.price_cents, product.currency)}
          </p>
        </div>
      </Link>
      {badge && <div className="pointer-events-none absolute top-2 left-2">{badge}</div>}
      <WishlistButton product={product} className="absolute top-2 right-2" />
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-muted aspect-3/4 animate-pulse rounded-2xl" />
      <div className="mt-3 space-y-2 px-0.5">
        <div className="bg-muted h-3.5 w-4/5 animate-pulse rounded" />
        <div className="bg-muted h-3 w-2/5 animate-pulse rounded" />
        <div className="bg-muted h-3.5 w-1/4 animate-pulse rounded" />
      </div>
    </div>
  );
}
