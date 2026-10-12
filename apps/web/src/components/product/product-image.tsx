import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Product } from "@/features/catalog/product";

type Props = {
  product: Pick<Product, "name" | "image">;
  /** Responsive `sizes` hint: what share of the viewport the image occupies. */
  sizes: string;
  priority?: boolean;
  className?: string;
};

/** Catalogue photos are 3:4 portraits; the blur placeholder is a tiny inline WebP from the API. */
export function ProductImage({ product, sizes, priority, className }: Props) {
  const { image, name } = product;
  return (
    <Image
      src={image.thumb_400}
      alt={name}
      width={400}
      height={533}
      sizes={sizes}
      priority={priority}
      fetchPriority={priority ? "high" : undefined}
      placeholder={image.blur_data_url ? "blur" : "empty"}
      blurDataURL={image.blur_data_url ?? undefined}
      className={cn("size-full object-cover", className)}
    />
  );
}
