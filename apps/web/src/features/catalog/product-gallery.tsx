"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Product } from "./product";

type Props = { product: Pick<Product, "name" | "image"> };

/**
 * The catalogue has one photo per product, so the thumbnail strip appears only when there are
 * several; the main image opens a full-size view either way.
 */
export function ProductGallery({ product }: Props) {
  const images = [product.image];
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0]!;

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Enlarge photo of ${product.name}`}
            className="bg-muted focus-visible:ring-ring/60 relative aspect-[3/4] flex-1 cursor-zoom-in overflow-hidden rounded-3xl outline-none focus-visible:ring-3"
          >
            <Image
              src={current.thumb_800}
              alt={product.name}
              width={800}
              height={1067}
              sizes="(min-width: 1024px) 40vw, 100vw"
              priority
              placeholder={current.blur_data_url ? "blur" : "empty"}
              blurDataURL={current.blur_data_url ?? undefined}
              className="size-full object-cover"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[92dvh] w-auto max-w-[min(92vw,640px)] p-2">
          <DialogTitle className="sr-only">{product.name}</DialogTitle>
          <DialogDescription className="sr-only">Full-size product photo.</DialogDescription>
          <Image
            src={current.thumb_800}
            alt={product.name}
            width={800}
            height={1067}
            sizes="(min-width: 640px) 640px, 92vw"
            className="max-h-[84dvh] w-auto rounded-xl object-contain"
          />
        </DialogContent>
      </Dialog>

      {images.length > 1 && (
        <ul className="flex gap-2 lg:flex-col" aria-label="Photos">
          {images.map((img, i) => (
            <li key={img.thumb_400}>
              <button
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "relative block aspect-[3/4] w-16 overflow-hidden rounded-xl border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  i === index ? "border-foreground" : "border-transparent opacity-70",
                )}
              >
                <Image src={img.thumb_400} alt="" width={64} height={85} className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
