import Image from "next/image";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Product } from "@/features/catalog/product";
import { PhotoSearchTrigger } from "@/features/search/photo-search-trigger";
import { newest } from "./home-data";
import { Tile } from "./tile";

/**
 * Гурван зураг тус бүр хаанаас ирэх. Дунд нь хамгийн том, apple.com-ын эхний tile-ийн бүтээгдэхүүн
 * шиг.
 */
const SLOTS = [
  { patch: { category: "footwear" }, size: "w-[30%] md:w-[22%]", offset: "mt-10 md:mt-16", hide: "hidden sm:block" },
  { patch: { department: "women", category: "apparel" }, size: "w-[46%] md:w-[28%]", offset: "mt-0", hide: "" },
  { patch: { department: "men", category: "apparel" }, size: "w-[40%] md:w-[24%]", offset: "mt-6 md:mt-10", hide: "" },
] as const;

/** Эхний tile дахь зураг тус бүр юуны зураг: department tile-д ижил бүтээгдэхүүн давтагдахгүй. */
async function heroPhotos(): Promise<(Product | undefined)[]> {
  return Promise.all(SLOTS.map(async (slot) => (await newest(slot.patch, 1))[0]));
}

/**
 * Эхний tile: дэлгүүрийн санаа нэг мөрөөр, хоёр орох зам (зураг эсвэл шинэ бараа), доор нь жинхэнэ
 * бүтээгдэхүүн. Гарчиг ба товчнууд энгийн (хэзээ ч нуухгүй, үл үзэгдэхээс animation хийхгүй), учир
 * нь хуудсыг тэдгээрээр хэмждэг.
 */
export async function Hero() {
  const photos = await heroPhotos();
  return (
    <Tile
      size="hero"
      as="h1"
      animate={false}
      label="Shop by photo"
      heading="Shop by photo."
      subtitle="Show us a look you love. We'll find the pieces that match it, ready to buy."
      actions={
        <>
          <PhotoSearchTrigger />
          <Button asChild variant="bordered" size="xl">
            <Link href="/products?sort=newest">Shop new arrivals</Link>
          </Button>
        </>
      }
    >
      {photos.some(Boolean) && (
        <div aria-hidden className="mt-10 flex w-full max-w-5xl flex-1 items-start justify-center gap-3 px-4 md:mt-12 md:gap-5">
          {SLOTS.map((slot, i) => {
            const product = photos[i];
            if (!product) return null;
            return (
              <div key={i} className={`photo-rise ${slot.size} ${slot.offset} ${slot.hide}`} style={{ "--i": i } as CSSProperties}>
                <div className="aspect-3/4 overflow-hidden rounded-t-2xl bg-white">
                  <Image
                    src={product.image.thumb_800}
                    alt=""
                    width={800}
                    height={1067}
                    sizes="(min-width: 768px) 28vw, 46vw"
                    priority={i === 1}
                    placeholder={product.image.blur_data_url ? "blur" : "empty"}
                    blurDataURL={product.image.blur_data_url ?? undefined}
                    className="size-full object-cover object-top"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Tile>
  );
}
