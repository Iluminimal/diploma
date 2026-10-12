"use client";

import Image from "next/image";
import "./zoom.css";
import { useRef, useState, type PointerEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Product } from "./product";

type Photo = Product["image"];
type Props = {
  product: Pick<Product, "name" | "image">;
  /** All of the product's photos, first one shown. The catalogue has one per product today. */
  images?: Photo[];
};

const SWIPE = 45; // px of horizontal travel that turns the page

/**
 * The product's photos. The stage cross-fades between them, a swipe (touch) or a thumbnail turns
 * the page, a mouse hovering the stage zooms in around the pointer (see `.zoom-stage` in
 * globals.css), and a click opens the full-size view. With one photo there is no strip and no swipe.
 */
export function ProductGallery({ product, images: given }: Props) {
  const images = given?.length ? given : [product.image];
  const [index, setIndex] = useState(0);
  const stage = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const current = images[index] ?? images[0]!;
  const go = (to: number) => setIndex((to + images.length) % images.length);

  // The stage is written to directly, not through state: the pointer moves many times a second.
  function zoomAt(event: PointerEvent<HTMLButtonElement>) {
    const box = stage.current;
    if (!box || event.pointerType !== "mouse") return;
    const rect = box.getBoundingClientRect();
    box.style.setProperty("--zx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    box.style.setProperty("--zy", `${((event.clientY - rect.top) / rect.height) * 100}%`);
    box.dataset.zoom = "true";
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <Dialog>
        <DialogTrigger asChild>
          <button
            ref={stage}
            type="button"
            data-fly-source
            aria-label={`Enlarge photo of ${product.name}`}
            className="zoom-stage tile focus-visible:ring-ring/60 relative aspect-[3/4] flex-1 cursor-zoom-in touch-pan-y outline-none focus-visible:ring-3 dark:bg-white"
            onPointerMove={zoomAt}
            onPointerEnter={zoomAt}
            onPointerLeave={() => {
              if (stage.current) stage.current.dataset.zoom = "false";
            }}
            onPointerDown={(event) => {
              touchStart.current = event.pointerType === "touch" ? event.clientX : null;
            }}
            onPointerUp={(event) => {
              const from = touchStart.current;
              touchStart.current = null;
              if (from === null || images.length < 2) return;
              const travelled = event.clientX - from;
              if (Math.abs(travelled) > SWIPE) go(index + (travelled < 0 ? 1 : -1));
            }}
          >
            {images.map((photo, i) => (
              <Image
                key={photo.thumb_800}
                src={photo.thumb_800}
                alt={i === index ? product.name : ""}
                aria-hidden={i === index ? undefined : true}
                width={800}
                height={1067}
                sizes="(min-width: 1024px) 40vw, 100vw"
                priority={i === 0}
                loading={i === 0 ? undefined : "lazy"}
                placeholder={photo.blur_data_url ? "blur" : "empty"}
                blurDataURL={photo.blur_data_url ?? undefined}
                data-active={i === index}
                className={cn(
                  "zoom-image absolute inset-0 size-full object-cover mix-blend-multiply dark:mix-blend-normal",
                  i === index ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              />
            ))}
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
                  "relative block aspect-[3/4] w-16 overflow-hidden rounded-xl border-2 transition-[opacity,border-color] duration-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  i === index ? "border-foreground" : "border-transparent opacity-60 hover:opacity-100",
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
