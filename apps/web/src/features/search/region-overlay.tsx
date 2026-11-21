"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/client";
import en from "../../../messages/en/search.json";

type Region = components["schemas"]["RegionOut"];
type ClassKey = keyof typeof en.regions.names;

function isKnownClass(key: string | null): key is ClassKey {
  return key !== null && key in en.regions.names;
}

type Props = {
  regions: Region[];
  selected: number;
  onSelect: (index: number) => void;
};

/** "top, t-shirt, sweatshirt" -> "top": орчуулгын түлхүүр болох detector-ийн ангийн эхний үг. */
export function regionKey(label: string | null): string | null {
  const first = label?.split(",")[0]?.trim().toLowerCase().replace(/\s+/g, "_");
  return first || null;
}

/**
 * Preview зураг дээр detector-ийн олсон хувцас бүрийн хайрцаг. Хайрцаг дээр дарж аль хувцсаар хайхаа
 * сонгоно. Хайрцгууд зургийн хэмжээнд харьцуулсан (0..1) тул зурагтай яг давхцах wrapper дотор
 * байрлана. Зөвхөн нэр бүхий хэсэг байвал харуулна (бүтэн зургийн fallback-д хайрцаг хэрэггүй).
 */
export function RegionOverlay({ regions, selected, onSelect }: Props) {
  const t = useTranslations("search.regions");
  const names = useTranslations("search.regions.names");
  if (!regions.some((r) => r.label)) return null;

  return (
    <div role="group" aria-label={t("group")} className="absolute inset-0">
      {regions.map((region, index) => {
        const key = regionKey(region.label);
        const name = isKnownClass(key) ? names(key) : (region.label ?? t("whole"));
        const active = index === selected;
        const { x, y, width, height } = region.box;
        return (
          <button
            key={index}
            type="button"
            aria-pressed={active}
            aria-label={t("choose", { name })}
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
              className={cn(
                "type-fine absolute -top-px -left-px max-w-full truncate rounded-br-md px-1.5 py-0.5 leading-none",
                active ? "bg-brand text-white" : "bg-black/65 text-white",
              )}
            >
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
