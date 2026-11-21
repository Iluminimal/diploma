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
 * Preview зураг дээр detector-ийн олсон хувцас бүрийн дугаартай хайрцаг. Дарвал тэр хувцсыг дэлгэрэнгүй
 * хайна. Хайрцгууд зургийн хэмжээнд харьцуулсан (0..1) тул зурагтай яг давхцах wrapper дотор байрлана.
 * Detector-ийн label итгэмжгүй (гутлыг "shorts" гэх мэт) тул нэр биш дугаар харуулна; дугаар нь үр
 * дүнгийн хэсгийн дугаартай ижил. Сонголт байхгүй (нэг л хувцас, эсвэл бүтэн зураг) үед харуулахгүй.
 */
export function RegionOverlay({ regions, selected, onSelect }: Props) {
  const t = useTranslations("search.regions");
  if (regions.length < 2) return null;

  return (
    <div role="group" aria-label={t("group")} className="absolute inset-0">
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
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }}
            className={cn(
              "focus-visible:ring-ring/60 absolute rounded-md border-2 outline-none transition-colors focus-visible:ring-3",
              active
                ? "border-brand bg-brand/10 z-10"
                : "border-white/80 shadow-[0_0_0_1px_rgb(0_0_0/0.25)] hover:border-brand hover:bg-brand/10",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute -top-px -left-px flex size-6 items-center justify-center rounded-br-md text-xs leading-none font-medium text-white",
                active ? "bg-brand" : "bg-black/65",
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
