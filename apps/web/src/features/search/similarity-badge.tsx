import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Cosine similarity-г бүхэл хувиар ("92% match"). */
export function matchPercent(similarity: number): number {
  return Math.max(0, Math.min(100, Math.round(similarity * 100)));
}

export function SimilarityBadge({ similarity }: { similarity: number }) {
  const t = useTranslations("search");
  const percent = matchPercent(similarity);
  return (
    <span
      aria-label={t("matchLabel", { percent })}
      className={cn(
        "bg-background/90 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-fine font-medium tabular-nums shadow-sm backdrop-blur",
        percent >= 85 ? "text-brand" : "text-foreground",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", percent >= 85 ? "bg-brand" : "bg-muted-foreground")} />
      {t("match", { percent })}
    </span>
  );
}
