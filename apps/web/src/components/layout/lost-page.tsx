import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";
import { useVocab } from "@/i18n/use-vocab";

/**
 * Ямар нэг зүйл алга эсвэл эвдэрсэн үеийн хуудсуудын нийтлэг дүр: хөвөх том зөөлөн тэмдэг, гарчиг,
 * хайлтын хайрцаг, дэлгүүр рүү буцах зам. Server дээр render хийж болно (script-гүй).
 */
export function LostPage({
  mark,
  title,
  children,
  actions,
}: {
  /** Том дүрс: "404", эсвэл алдаанд зориулсан тэмдэг. */
  mark: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const t = useTranslations("layout.lost");
  const vocab = useVocab();
  return (
    <div className="container-page flex flex-col items-center gap-6 py-24 text-center md:py-32">
      <p
        aria-hidden
        className="animate-float text-muted-foreground/90 text-[7rem] leading-none font-semibold tracking-tighter select-none md:text-[10rem]"
      >
        {mark}
      </p>
      <div className="animate-in fade-in slide-in-from-bottom-3 space-y-2 duration-700">
        <h1 className="type-display text-balance">{title}</h1>
        <p className="text-muted-foreground type-body mx-auto max-w-md text-balance">{children}</p>
      </div>
      <form
        action="/products"
        role="search"
        className="animate-in fade-in slide-in-from-bottom-3 relative w-full max-w-sm delay-100 duration-700 fill-mode-backwards"
      >
        <label htmlFor="lost-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        <input
          id="lost-search"
          name="q"
          type="search"
          placeholder={t("searchPlaceholder")}
          className="bg-secondary focus-visible:ring-ring/50 h-11 w-full rounded-full pr-4 pl-10 type-body outline-none focus-visible:ring-3"
        />
      </form>
      <nav
        aria-label={t("popular")}
        className="animate-in fade-in slide-in-from-bottom-3 flex flex-wrap justify-center gap-2 delay-200 duration-700 fill-mode-backwards"
      >
        {DEPARTMENT_LINKS.map((department) => (
          <Button key={department.slug} asChild variant="secondary">
            <Link href={categoryHref(department.slug)}>{vocab.department(department.label)}</Link>
          </Button>
        ))}
        <Button asChild variant="secondary">
          <Link href="/products?sort=newest">{t("newArrivals")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/search">{t("searchByPhoto")}</Link>
        </Button>
      </nav>
      {actions}
    </div>
  );
}
