import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SplitWords } from "@/components/motion/split-words";
import { Button } from "@/components/ui/button";
import { PhotoSearchTrigger } from "@/features/search/photo-search-trigger";
import { newest } from "./home-data";

const STEPS = ["shoot", "match", "buy"] as const;

/** Таних хүрээнүүд (зургийн хувиар): хувцасны хэсгүүдийг "олсон" мэт. */
const DETECTIONS = [
  { top: "12%", left: "22%", width: "56%", height: "34%" },
  { top: "50%", left: "24%", width: "52%", height: "40%" },
] as const;

/**
 * Хар түүх: нэг зургаас сагс хүртэл. Өргөн дэлгэц дээр section өндөр (260vh), дотор нь sticky тайз
 * тогтдог тул scroll хийх бүрт түүх урагшилна: 1) зураг, 2) скан зурвас дээрээс доош сэлгэж, таних
 * булан, хүрээ гарна, 3) төстэй гурван бараа зургийн хажуугаас гарч ирнэ; идэвхтэй алхам тод,
 * бусад бүдэг, прогресс шугам дүүрнэ. Бүгд нэг `view-timeline` дээрх CSS (`styles/effects.css`,
 * `.story*`): JS-гүй, зөвхөн transform, opacity. Дэмжлэггүй browser, утас, reduced motion үед
 * pin байхгүй: ердийн өндөртэй, бүх алхам, бараа шууд харагдана. Бүх агуулга DOM-д эхнээс бий.
 */
export async function PhotoTile() {
  const [t, items] = await Promise.all([getTranslations("home.photo"), newest({ department: "women", category: "apparel" }, 6)]);
  const example = items[2] ?? items[0];
  const matches = items.filter((item) => item !== example).slice(0, 3);
  return (
    <section aria-label={t("label")} className="story relative border-y border-border bg-[var(--gh-sunken)]">
      <div className="story-stage flex flex-col items-center justify-center gap-10 px-4 py-14 text-center md:gap-12 md:py-0">
        <div>
          <p className="gh-eyebrow" style={{ "--e": "var(--gh-green)" } as CSSProperties}>{t("label")}</p>
          <h2 className="gh-h2 mx-auto mt-4 max-w-3xl">
            <SplitWords>{t("heading")}</SplitWords>
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <PhotoSearchTrigger label={t("tryIt")} />
            <Button asChild variant="bordered" size="xl">
              <Link href="/search">{t("open")}</Link>
            </Button>
          </div>
        </div>

        <div className="grid w-full max-w-5xl items-center gap-8 md:grid-cols-[minmax(0,17rem)_1fr] md:gap-14 md:text-left">
          {example && (
            <div aria-hidden className="story-photo relative mx-auto aspect-3/4 w-44 overflow-hidden rounded-xl border border-border bg-white md:w-full">
              <Image src={example.image.thumb_400} alt="" fill fetchPriority="low" sizes="(min-width: 768px) 272px, 176px" className="object-cover object-top" />
              <div className="story-scan absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-brand/45 to-transparent" />
              {DETECTIONS.map((box, i) => (
                <span key={i} style={box} className="story-detect absolute rounded-lg border-2 border-brand" />
              ))}
              {["top-3 left-3 border-t-2 border-l-2", "top-3 right-3 border-t-2 border-r-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-r-2 border-b-2"].map((corner) => (
                <span key={corner} className={`story-detect absolute size-6 rounded-sm border-brand ${corner}`} />
              ))}
            </div>
          )}

          <div className="space-y-8">
            <ol className="space-y-6 text-left">
              {STEPS.map((key, i) => (
                <li key={key} className={`story-step-${i + 1} bg-card flex items-center gap-4 rounded-xl border border-border p-4`}>
                  <span aria-hidden className="bg-accent text-foreground grid size-8 shrink-0 place-items-center rounded-full text-sm">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-xl font-semibold tracking-tight">{t(`steps.${key}`)}</span>
                </li>
              ))}
            </ol>
            {matches.length > 0 && (
              <div aria-hidden className="flex justify-center gap-3 md:justify-start">
                {matches.map((item, i) => (
                  <div key={item.id} style={{ "--i": i } as CSSProperties} className="story-match aspect-3/4 w-20 overflow-hidden rounded-lg border border-border bg-white md:w-24">
                    <Image src={item.image.thumb_400} alt="" width={200} height={267} sizes="96px" fetchPriority="low" className="size-full object-cover object-top" />
                  </div>
                ))}
              </div>
            )}
            <div aria-hidden className="story-progress bg-border h-0.5 w-full overflow-hidden rounded-full">
              <div className="story-progress-bar bg-primary h-full w-full origin-left" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
