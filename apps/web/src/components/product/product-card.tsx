import type { ReactNode } from "react";
import { CardLink } from "@/components/product/card-link";
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
    <article className={cn("group relative", className)}>
      <CardLink
        href={productPath(product)}
        className="focus-visible:ring-ring/60 block rounded-2xl outline-none transition-transform duration-300 ease-out-expo focus-visible:ring-3 active:scale-[0.985]"
      >
        {/* The catalogue photos have white backgrounds: multiplied onto the grey tile they melt into it,
            the way Apple's product shots sit on their tiles. In dark mode the tile is white instead. */}
        <div data-card-photo className="bg-secondary relative aspect-3/4 overflow-hidden rounded-3xl dark:bg-white">
          <ProductImage
            product={product}
            sizes={sizes}
            priority={priority}
            className="mix-blend-multiply transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04] dark:mix-blend-normal"
          />
          {!product.in_stock && (
            <span className="bg-background/90 text-foreground absolute right-2 bottom-2 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur">
              Sold out
            </span>
          )}
        </div>
        <div className="mt-4 space-y-0.5 px-1">
          <Heading className="line-clamp-2 text-sm leading-snug font-semibold tracking-tight">{product.name}</Heading>
          <p className="text-muted-foreground truncate text-xs">{productSubtitle(product)}</p>
          {product.rating_count > 0 && product.rating_average !== null && (
            <p className="flex items-center gap-1.5 pt-1">
              <RatingStars rating={product.rating_average} size="sm" />
              <span aria-hidden className="text-muted-foreground text-xs tabular-nums">
                ({product.rating_count})
              </span>
            </p>
          )}
          <p className="pt-1.5 text-sm tabular-nums">
            {formatPrice(product.price_cents, product.currency)}
          </p>
        </div>
      </CardLink>
      {badge && <div className="pointer-events-none absolute top-2 left-2">{badge}</div>}
      <WishlistButton product={product} className="absolute top-2 right-2" />
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="aspect-3/4 rounded-3xl" />
      <div className="mt-3 space-y-2 px-0.5">
        <Skeleton className="h-3.5 w-4/5 rounded" />
        <Skeleton className="h-3 w-2/5 rounded" />
        <Skeleton className="h-3.5 w-1/4 rounded" />
      </div>
    </div>
  );
}
