import Image from "next/image";
import "./story.css";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { ScrollFade } from "@/components/motion/scroll-fade";
import { Button } from "@/components/ui/button";
import { categoryHref } from "@/features/catalog/nav";
import type { Product } from "@/features/catalog/product";
import { PhotoSearchTrigger } from "@/features/search/photo-search-trigger";
import { newest } from "./home-data";

// Left to right: where each photo comes from, how big it is, how far down it sits and how far it
// drifts up while the page scrolls away. Alternating heights and speeds is what makes it feel deep.
const SLOTS = [
  { patch: { category: "footwear" }, size: "w-[34%] md:w-[17%]", offset: "mt-16 md:mt-24", drift: "-30px", hide: "hidden md:block" },
  { patch: { department: "women", category: "apparel" }, size: "w-[40%] md:w-[20%]", offset: "mt-6 md:mt-8", drift: "-90px", hide: "" },
  { patch: { department: "men", category: "apparel" }, size: "w-[44%] md:w-[24%]", offset: "mt-0", drift: "-140px", hide: "" },
  { patch: { department: "kids", category: "apparel" }, size: "w-[40%] md:w-[20%]", offset: "mt-10 md:mt-14", drift: "-60px", hide: "hidden md:block" },
  { patch: { category: "accessories" }, size: "w-[34%] md:w-[17%]", offset: "mt-20 md:mt-28", drift: "-20px", hide: "hidden md:block" },
] as const;

async function collage(): Promise<(Product | undefined)[]> {
  return Promise.all(SLOTS.map(async (slot) => (await newest(slot.patch, 1))[0]));
}

/**
 * The first screen: a huge headline, two ways in, and a row of real photos that drift apart as you
 * scroll. The headline and buttons are plain (never hidden or animated from invisible), because
 * they are what the page is measured on.
 */
export async function Hero() {
  const photos = await collage();
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden pb-8 md:pb-16">
      <ScrollFade className="container-page pt-14 text-center md:pt-24">
        <p className="text-muted-foreground mb-4 text-sm font-medium md:text-base">Visual search for fashion</p>
        <h1
          id="hero-heading"
          className="mx-auto max-w-4xl text-6xl leading-[0.95] font-semibold tracking-tighter text-balance sm:text-7xl md:text-8xl"
        >
          Shop by photo.
        </h1>
        <Reveal as="p" when="mount" delay={0.12} className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg text-balance md:text-xl">
          Show us a look you love. We&apos;ll find the pieces that match it, ready to buy.
        </Reveal>
        <Reveal when="mount" delay={0.24} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PhotoSearchTrigger />
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7 text-base">
            <Link href={categoryHref("women")}>Shop women</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7 text-base">
            <Link href={categoryHref("men")}>Shop men</Link>
          </Button>
        </Reveal>
      </ScrollFade>

      {photos.some(Boolean) && (
        <div aria-hidden className="container-page mt-12 flex items-start justify-center gap-3 md:mt-16 md:gap-5">
          {SLOTS.map((slot, i) => {
            const product = photos[i];
            if (!product) return null;
            return (
              <div
                key={slot.patch.category + (("department" in slot.patch && slot.patch.department) || "")}
                className={`drift ${slot.size} ${slot.offset} ${slot.hide}`}
                style={{ "--drift": slot.drift } as React.CSSProperties}
              >
                <div className="bg-secondary aspect-3/4 overflow-hidden rounded-3xl shadow-[0_30px_60px_-30px_oklch(0_0_0/0.35)] dark:bg-white">
                  <Image
                    src={product.image.thumb_800}
                    alt=""
                    width={800}
                    height={1067}
                    sizes="(min-width: 768px) 24vw, 44vw"
                    priority={i === 1 || i === 2}
                    placeholder={product.image.blur_data_url ? "blur" : "empty"}
                    blurDataURL={product.image.blur_data_url ?? undefined}
                    className="size-full object-cover mix-blend-multiply dark:mix-blend-normal"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
