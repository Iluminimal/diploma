"use client";

import { ArrowRight, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/ui/button";
import { useVocab } from "@/i18n/use-vocab";
import { cn } from "@/lib/utils";
import type { Garment } from "./search-api";
import { SimilarityBadge } from "./similarity-badge";

type Props = {
  garments: Garment[];
  /** Хувцас руу шилжиж, түүнийг дэлгэрэнгүй (илүү олон үр дүнтэй) хайна. */
  onFocus: (index: number) => void;
  /** Шүүлтүүр солигдож, өмнөх үр дүн шинэчлэгдэж байна. */
  refreshing: boolean;
};

/**
 * Зурагт олдсон хувцас бүрт нэг хэсэг: дугаар (preview дээрх хайрцгийн дугаартай ижил), CLIP-ийн таамагласан
 * ангилал, хэдэн төстэй бараа. Detector-ийн өөрийн label (гутлыг "shorts" гэх мэт) итгэмжгүй тул нэр
 * болгон харуулахгүй.
 */
export function GarmentSections({ garments, onFocus, refreshing }: Props) {
  const t = useTranslations("search.garments");
  const vocab = useVocab();

  return (
    <div className={cn("space-y-10 transition-opacity", refreshing && "opacity-50")} aria-busy={refreshing}>
      {garments.map((garment) => {
        const number = garment.index + 1;
        const top = garment.detected[0];
        return (
          <section key={garment.index} aria-labelledby={`garment-${garment.index}`} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden
                className="bg-brand flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
              >
                {number}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`garment-${garment.index}`} className="type-title">
                  {t("title", { number })}
                </h2>
                {top && (
                  <p className="text-muted-foreground type-caption">
                    {t("looksLike", { name: vocab.category(top.article_type) })}
                  </p>
                )}
              </div>
              {garment.results.length > 0 && (
                <Button variant="outline" size="lg" className="h-10" onClick={() => onFocus(garment.index)}>
                  {t("seeAll", { number })} <ArrowRight />
                </Button>
              )}
            </div>

            {garment.results.length === 0 ? (
              <div className="tile flex items-center gap-3 px-5 py-6">
                <SearchX className="text-muted-foreground size-5 shrink-0" />
                <p className="text-muted-foreground type-caption">{t("none")}</p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5">
                {garment.results.map((hit, i) => (
                  <li key={hit.product.id}>
                    <ProductCard
                      product={hit.product}
                      priority={garment.index === 0 && i < 3}
                      headingLevel={3}
                      sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 50vw"
                      badge={<SimilarityBadge similarity={hit.similarity} />}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
