import type { ReactNode } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/product/product-image";
import { RatingStars } from "@/components/product/rating-stars";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import { formatPrice, productPath, productSubtitle, type Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
    <article className={cn("group relative h-full", className)}>
      <Link
        href={productPath(product)}
        className="tile press-card focus-visible:ring-ring/60 flex h-full flex-col outline-none focus-visible:ring-3"
      >
        {/* The catalogue photos have white backgrounds: multiplied onto the grey tile they melt into it,
            the way Apple's product shots sit on their tiles. In dark mode the tile is white instead. */}
        <div data-card-photo className="relative aspect-3/4 overflow-hidden dark:bg-white">
          <ProductImage
            product={product}
            sizes={sizes}
            priority={priority}
            className="mix-blend-multiply transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04] dark:mix-blend-normal"
          />
          {!product.in_stock && (
            <span className="bg-background/90 text-foreground type-fine absolute right-3 bottom-3 rounded-full px-2.5 py-1 font-medium backdrop-blur">
              Sold out
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-0.5 px-4 pt-4 pb-4 md:px-5 md:pb-5">
          <Heading className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold md:text-[1.0625rem]">{product.name}</Heading>
          <p className="text-muted-foreground type-caption truncate">{productSubtitle(product)}</p>
          {product.rating_count > 0 && product.rating_average !== null && (
            <p className="flex items-center gap-1.5 pt-1">
              <RatingStars rating={product.rating_average} size="sm" />
              <span aria-hidden className="text-muted-foreground text-xs tabular-nums">
                ({product.rating_count})
              </span>
            </p>
          )}
          <p className="type-caption mt-auto pt-2 tabular-nums">
            {formatPrice(product.price_cents, product.currency)}
          </p>
        </div>
      </Link>
      {badge && <div className="pointer-events-none absolute top-3 left-3">{badge}</div>}
      <WishlistButton product={product} className="absolute top-2 right-2" />
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden className="tile">
      <Skeleton className="aspect-3/4 rounded-none opacity-50" />
      <div className="space-y-2 px-4 py-4 md:px-5 md:pb-5">
        <Skeleton className="h-4 w-4/5 rounded opacity-60" />
        <Skeleton className="h-3.5 w-2/5 rounded opacity-60" />
        <Skeleton className="h-3.5 w-1/4 rounded opacity-60" />
      </div>
    </div>
  );
}
