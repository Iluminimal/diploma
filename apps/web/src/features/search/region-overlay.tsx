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

/**
 * Давхцсан хайрцагт жижиг нь дээр байх ёстой (цамцны дотор хантааз гэх мэт), эс бөгөөс том нь жижгийг
 * хаачихна. Талбайн дарааллаар z-index: хамгийн жижиг нь хамгийн дээд.
 */
export function stackOrder(regions: Region[]): number[] {
  const bySize = regions
    .map((r, index) => ({ index, area: r.box.width * r.box.height }))
    .sort((a, b) => b.area - a.area);
  const order = new Array<number>(regions.length).fill(0);
  bySize.forEach(({ index }, rank) => (order[index] = rank));
  return order;
}

/**
 * Preview зураг дээр detector-ийн олсон хувцас бүрийг цэгэн хүрээгээр тойруулна (Amazon-ы зураг хайлт
 * шиг). Хүрээн дотор дарвал тэр хувцсыг дэлгэрэнгүй хайна; hover, focus, сонгосон үед хүрээ цэнхэр болж
 * өнгөлөгдөнө. Хүрээнүүд зургийн хэмжээнд харьцуулсан (0..1) тул зурагтай яг давхцах wrapper дотор
 * байрлана. Detector-ийн label итгэмжгүй (гутлыг "shorts" гэх мэт) тул нэр биш булан дахь дугаар
 * харуулна; дугаар нь үр дүнгийн хэсгийн дугаартай ижил. Сонголт байхгүй (нэг л хувцас, эсвэл бүтэн
 * зураг) үед харуулахгүй.
 */
export function RegionOverlay({ regions, selected, onSelect }: Props) {
  const t = useTranslations("search.regions");
  if (regions.length < 2) return null;
  const order = stackOrder(regions);

  return (
    <div role="group" aria-label={t("group")} className="pointer-events-none absolute inset-0">
      {regions.map((region, index) => {
        const active = index === selected;
        const { x, y, width, height } = region.box;
        return (
          <button
            key={index}
            type="button"
            aria-pressed={active}
            aria-label={t("choose", { number: index + 1 })}
            onClick={() => onSelect(index)}
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
              zIndex: 10 + order[index]!,
            }}
            className={cn(
              "group pointer-events-auto absolute cursor-pointer rounded-2xl outline-none transition-colors",
              active ? "bg-brand/10" : "hover:bg-white/15 focus-visible:bg-white/15",
            )}
          >
            {/* Цэгэн хүрээ: цэг бүр дугуй, сүүдэртэй тул ямар ч зураг дээр харагдана. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 rounded-2xl border-[3px] border-dotted drop-shadow-[0_0_1.5px_rgb(0_0_0/0.7)] transition-colors",
                active
                  ? "border-brand"
                  : "border-white group-hover:border-brand group-focus-visible:border-brand",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "absolute -top-3 -left-3 flex size-6 items-center justify-center rounded-full text-xs leading-none font-semibold shadow-[0_1px_6px_rgb(0_0_0/0.45)] transition-colors",
                active
                  ? "bg-brand text-white"
                  : "text-foreground group-hover:bg-brand bg-white group-hover:text-white group-focus-visible:bg-brand group-focus-visible:text-white",
              )}
            >
              {index + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
