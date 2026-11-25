import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  page: number;
  pages: number;
  total: number;
  /** Нэг жагсаалтын өөр хуудасны URL. */
  hrefFor: (page: number) => string;
};

const PILL =
  "bg-muted hover:bg-foreground/[0.08] focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3";

export function ListPagination({ label, page, pages, total, hrefFor }: Props) {
  const t = useTranslations("admin.pagination");
  if (pages <= 1) return <p className="text-muted-foreground px-1 text-sm">{t("total", { total })}</p>;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={PILL}>
          <ChevronLeft aria-hidden className="size-4" /> {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-center">{t("position", { page, pages, total })}</span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className={cn(PILL)}>
          {t("next")} <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
