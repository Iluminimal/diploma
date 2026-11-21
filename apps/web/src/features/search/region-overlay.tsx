"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/client";

type Region = components["schemas"]["RegionOut"];

type Props = {
  regions: Region[];
  selected: number;
  onSelect: (index: number) => void;
};

/** Хоёр цэгийн хамгийн бага зай (зургийн хэмжээнд харьцуулсан): ойр бол хоёр дахь нь доош хөдөлнө. */
const MIN_GAP = 0.1;
const NUDGE = 0.1;

/**
 * Хувцас бүрийн цэгийн байрлал (зургийн хэмжээнд харьцуулсан 0..1): хайрцгийн төв. Хоёр хайрцгийн төв
 * давхцах (жишээ нь цамцны дээрх хантааз) үед хоёр дахь цэг нь доош хөдөлж, дарахад хэцүү болохгүй.
 */
export function dotPositions(regions: Region[]): { x: number; y: number }[] {
  const placed: { x: number; y: number }[] = [];
  for (const { box } of regions) {
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    for (let attempt = 0; attempt < 4; attempt++) {
      const clash = placed.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < MIN_GAP);
      if (!clash) break;
      point.y = Math.min(0.95, point.y + NUDGE);
    }
    placed.push(point);
  }
  return placed;
}

/**
 * Preview зураг дээр detector-ийн олсон хувцас бүрийн төвд дугаартай цэг (Amazon-ы зураг хайлт шиг).
 * Цэг дээр дарвал тэр хувцсыг дэлгэрэнгүй хайна; hover, focus хийхэд юуг хайх хүрээ нь харагдана.
 * Цэгүүд зургийн хэмжээнд харьцуулсан (0..1) тул зурагтай яг давхцах wrapper дотор байрлана. Detector-ийн
 * label итгэмжгүй (гутлыг "shorts" гэх мэт) тул нэр биш дугаар харуулна; дугаар нь үр дүнгийн хэсгийн
 * дугаартай ижил. Сонголт байхгүй (нэг л хувцас, эсвэл бүтэн зураг) үед харуулахгүй.
 */
export function RegionOverlay({ regions, selected, onSelect }: Props) {
  const t = useTranslations("search.regions");
  if (regions.length < 2) return null;
  const dots = dotPositions(regions);

  return (
    <div role="group" aria-label={t("group")} className="pointer-events-none absolute inset-0">
      {regions.map((region, index) => {
        const active = index === selected;
        const { x, y, width, height } = region.box;
        const dot = dots[index]!;
        return (
          <div key={index} className="contents">
            <button
              type="button"
              aria-pressed={active}
              aria-label={t("choose", { number: index + 1 })}
              onClick={() => onSelect(index)}
              style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
              className="peer pointer-events-auto absolute z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none"
            >
              {/* Анхаарал татах долгион: хөдөлгөөн багасгасан хэрэглэгчид харагдахгүй. */}
              {!active && (
                <span aria-hidden className="absolute inset-1 rounded-full bg-white/70 motion-safe:animate-ping" />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative flex size-6 items-center justify-center rounded-full text-xs leading-none font-semibold shadow-[0_1px_6px_rgb(0_0_0/0.45)] ring-2 transition-transform",
                  "peer-hover:scale-110 peer-focus-visible:ring-4",
                  active ? "bg-brand ring-white text-white" : "text-foreground bg-white ring-white/60",
                )}
              >
                {index + 1}
              </span>
            </button>
            {/* Хайх хүрээ: зөвхөн цэгийг заах, сонгосон үед. */}
            <span
              aria-hidden
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }}
              className={cn(
                "border-brand pointer-events-none absolute rounded-md border-2 bg-brand/10 transition-opacity",
                active ? "opacity-100" : "opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
