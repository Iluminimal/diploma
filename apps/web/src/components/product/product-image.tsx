import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Product } from "@/features/catalog/product";

type Props = {
  product: Pick<Product, "name" | "image">;
  /** Responsive `sizes` hint: зураг viewport-ын хэдэн хувийг эзэлдэг. */
  sizes: string;
  priority?: boolean;
  className?: string;
};

/** Каталогийн зургууд 3:4 босоо; blur placeholder нь API-аас ирдэг жижиг inline WebP. */
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
