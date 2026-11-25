import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ProductImage } from "@/components/product/product-image";
import { RatingStars } from "@/components/product/rating-stars";
import { QuickAdd } from "@/features/cart/quick-add";
import { WishlistButton } from "@/features/wishlist/wishlist-button";
import { productPath, productSubtitle, type Product } from "@/features/catalog/product";
import { useFormat } from "@/i18n/use-format";
import { useVocab } from "@/i18n/use-vocab";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  product: Product;
  sizes?: string;
  priority?: boolean;
  /** Зургийн зүүн дээд буланд давхарласан элемент (жишээ нь төстэй байдлын badge). */
  badge?: ReactNode;
  /**
   * Барааны нэрийн heading түвшин: хуудасны h1-ийн шууд доор бол 2, section heading-ийн доор бол 3.
   */
  headingLevel?: 2 | 3;
  className?: string;
};

export const GRID_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

export function ProductCard({ product, sizes = GRID_SIZES, priority, badge, headingLevel = 3, className }: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const t = useTranslations("catalog");
  const format = useFormat();
  const vocab = useVocab();
  return (
    <article className={cn("group relative h-full", className)}>
      <Link
        href={productPath(product)}
        data-tilt
        className="tile press-card focus-visible:ring-ring/50 relative flex h-full flex-col outline-none focus-visible:ring-3"
      >
        {/* Каталогийн зургууд цагаан дэвсгэртэй: саарал tile дээр үржүүлбэл tile-тэй нийлнэ,
           Apple-ийн барааны зураг tile дээр байдагтай адил. Харанхуй горимд tile нь цагаан. */}
        <div data-card-photo className="relative aspect-3/4 overflow-hidden dark:bg-white">
          <ProductImage
            product={product}
            sizes={sizes}
            priority={priority}
            className="mix-blend-multiply transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04] dark:mix-blend-normal"
          />
          {!product.in_stock ? (
            <span className="bg-background/90 text-foreground type-fine absolute right-3 bottom-3 rounded-full px-2.5 py-1 font-medium backdrop-blur">
              {t("soldOutBadge")}
            </span>
          ) : (
            product.low_stock && (
              <span className="soft-pulse bg-background/90 text-warning-foreground type-fine absolute bottom-3 left-3 rounded-full px-2.5 py-1 font-medium backdrop-blur">
                {t("fewLeftBadge")}
              </span>
            )
          )}
        </div>
        <div className="flex flex-1 flex-col gap-0.5 px-4 pt-4 pb-4 md:px-5 md:pb-5">
          <Heading className="line-clamp-2 type-caption leading-snug font-semibold md:type-body">{product.name}</Heading>
          <p className="text-muted-foreground type-caption truncate">{productSubtitle(product, vocab)}</p>
          {product.rating_count > 0 && product.rating_average !== null && (
            <p className="flex items-center gap-1.5 pt-1">
              <RatingStars rating={product.rating_average} size="sm" />
              <span aria-hidden className="text-muted-foreground type-fine tabular-nums">
                ({product.rating_count})
              </span>
            </p>
          )}
          <p className="type-caption mt-auto pt-2 tabular-nums">
            {format.price(product.price_cents, product.currency)}
          </p>
        </div>
      </Link>
      {badge && <div className="pointer-events-none absolute top-3 left-3">{badge}</div>}
      <WishlistButton product={product} className="absolute top-2 right-2" />
      {/* Зургийн хэмжээтэй (3:4) тунгалаг давхарга: товч зургийн баруун доод буланд, холбоосын гадна. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-3/4">
        <QuickAdd product={product} className="pointer-events-auto absolute right-3 bottom-3" />
      </div>
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
