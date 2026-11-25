"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AppliedFilter } from "@/features/catalog/product";
import { useFormat } from "@/i18n/use-format";
import { useVocab } from "@/i18n/use-vocab";

/**
 * Бичсэн үгээс API юуг шүүлтүүр болгон таньснаа харуулна ("Өнгө: Цэнхэр", "Үнэ ≤ ₮ 175,000").
 * Зөвхөн мэдээлэл: өөрчлөхийн тулд текстээ засна.
 */
export function AppliedFilters({ applied }: { applied: AppliedFilter[] }) {
  const t = useTranslations("search.applied");
  const vocab = useVocab();
  const format = useFormat();
  if (applied.length === 0) return null;

  function label({ key, value }: AppliedFilter): string {
    switch (key) {
      case "color":
        return t("color", { value: vocab.colour(value) });
      case "gender":
        return t("gender", { value: vocab.gender(value) });
      case "season":
        return t("season", { value: vocab.season(value) });
      case "usage":
        return t("usage", { value: vocab.usage(value) });
      case "min_price":
        return t("minPrice", { value: format.price(Number(value)) });
      case "max_price":
        return t("maxPrice", { value: format.price(Number(value)) });
      case "in_stock":
        return t("inStock");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 type-caption" role="status" aria-live="polite">
      <span className="text-muted-foreground inline-flex items-center gap-1.5 type-fine">
        <Sparkles className="size-3.5" aria-hidden /> {t("heading")}
      </span>
      <ul className="contents">
        {applied.map((item) => (
          <li key={`${item.key}:${item.value}`} className="bg-muted rounded-full px-3 py-1 type-fine font-medium">
            {label(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
