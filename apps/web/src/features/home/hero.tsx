import { getTranslations } from "next-intl/server";
import Image from "next/image";
import type { CSSProperties } from "react";
import Link from "next/link";
import { SplitWords } from "@/components/motion/split-words";
import { Button } from "@/components/ui/button";
import type { Product } from "@/features/catalog/product";
import { PhotoSearchTrigger } from "@/features/search/photo-search-trigger";
import { newest } from "./home-data";

/** Demo хүрээн дэх гурван зураг: дунд нь "танигдсан" (хүрээ, скан зурвас). */
const SLOTS = [
  { patch: { category: "footwear" }, hide: "hidden sm:block" },
  { patch: { department: "women", category: "apparel" }, hide: "" },
  { patch: { department: "men", category: "apparel" }, hide: "" },
] as const;

async function heroPhotos(): Promise<(Product | undefined)[]> {
  return Promise.all(SLOTS.map(async (slot) => (await newest(slot.patch, 1))[0]));
}

/**
 * Эхний хэсэг (GitHub хэв, цайвар): ард нь зөөлөн ягаан, цэнхэр гэрэл; зүүн талд өнгөт шошго, том гарчиг, ногоон
 * ба хүрээтэй товч; баруун талд зургаар хайхын demo (card дотор гурван бүтээгдэхүүн, дунд нь
 * таних хүрээ). Утсан дээр төвд, нэг багана. Гарчиг, товчнууд хэзээ ч нуугддаггүй (зөвхөн
 * `translate`): LCP нь дунд зураг (priority).
 */
export async function Hero() {
  const [photos, t] = await Promise.all([heroPhotos(), getTranslations("home.hero")]);
  const visible = photos.map((product, i) => ({ product, slot: SLOTS[i]! })).filter((entry) => entry.product);
  return (
    <section aria-label={t("label")} className="relative isolate overflow-clip border-b border-border">
      <div aria-hidden className="gh-glow absolute inset-x-0 top-0 -z-10 h-[40rem]" />
      <div className="container-page grid items-center gap-12 py-16 text-center md:py-24 lg:grid-cols-[1fr_1.05fr] lg:text-left">
        <div>
          <p style={{ "--d": "0ms" } as CSSProperties} className="gh-eyebrow hero-rise">{t("label")}</p>
          <h1 className="gh-title mt-5">
            <SplitWords>{t.rich("heading", { g: (chunks) => <span className="text-gradient">{chunks}</span> })}</SplitWords>
          </h1>
          <div style={{ "--d": "320ms" } as CSSProperties} className="hero-rise mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <PhotoSearchTrigger />
            <Button asChild variant="bordered" size="xl">
              <Link href="/products?sort=newest">{t("newArrivals")}</Link>
            </Button>
          </div>
        </div>
        {visible.length > 0 && (
          <div aria-hidden style={{ "--d": "460ms" } as CSSProperties} className="gh-frame hero-rise mx-auto w-full max-w-xl">
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:gap-4 md:p-4">
              {visible.map(({ product, slot }) => {
                const focus = slot === SLOTS[1];
                return (
                  <div key={product!.id} className={`${slot.hide} relative aspect-3/4 overflow-hidden rounded-lg border border-border bg-white`}>
                    <Image
                      src={product!.image.thumb_800}
                      alt=""
                      width={800}
                      height={1067}
                      sizes="(min-width: 1024px) 190px, (min-width: 768px) 240px, 45vw"
                      priority={focus}
                      // Хоёр хажуугийн зураг LCP зурагтай зурвас булаацалдахгүй.
                      fetchPriority={focus ? "high" : "low"}
                      placeholder={product!.image.blur_data_url ? "blur" : "empty"}
                      blurDataURL={product!.image.blur_data_url ?? undefined}
                      className="size-full object-cover object-top"
                    />
                    {focus && (
                      <>
                        <div className="animate-scan absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-brand/45 to-transparent" />
                        <span className="absolute top-[14%] left-[20%] h-[34%] w-[60%] rounded-md border-2 border-brand" />
                        <span className="absolute top-[52%] left-[22%] h-[38%] w-[56%] rounded-md border-2 border-brand" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
