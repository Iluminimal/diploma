import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useFormat } from "@/i18n/use-format";
import { useVocab } from "@/i18n/use-vocab";
import { MULTI_KEYS, toHref, type ListingQuery, type MultiKey } from "./filters";

const VOCAB_KIND = {
  gender: "gender",
  master_category: "category",
  sub_category: "category",
  article_type: "category",
  color: "colour",
  season: "season",
  usage: "usage",
} as const satisfies Record<MultiKey, string>;

/** Устгах боломжтой chip-үүд энгийн холбоос: client JS хэрэггүй, chip бүр тэр утгагүй URL. */
export function ActiveFilters({ query, path = "/products" }: { query: ListingQuery; path?: string }) {
  const t = useTranslations("catalog");
  const format = useFormat();
  const vocab = useVocab();
  const chips: { label: string; href: string }[] = [];
  const without = (patch: Partial<ListingQuery>) => toHref(path, { ...query, ...patch, page: 1 });

  for (const key of MULTI_KEYS) {
    for (const value of query[key]) {
      chips.push({ label: vocab[VOCAB_KIND[key]](value), href: without({ [key]: query[key].filter((v) => v !== value) }) });
    }
  }
  if (query.min_price !== undefined || query.max_price !== undefined) {
    const lo = query.min_price !== undefined ? format.price(query.min_price) : t("any");
    const hi = query.max_price !== undefined ? format.price(query.max_price) : t("any");
    chips.push({
      label: t("priceChip", { low: lo, high: hi }),
      href: without({ min_price: undefined, max_price: undefined }),
    });
  }
  if (query.in_stock) chips.push({ label: t("inStock"), href: without({ in_stock: false }) });
  if (query.q) chips.push({ label: t("quoted", { query: query.q }), href: without({ q: undefined, sort: query.sort === "relevance" ? undefined : query.sort }) });

  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={t("activeFilters")}>
      {chips.map((chip) => (
        <li key={chip.label + chip.href}>
          <Link
            href={chip.href}
            scroll={false}
            className="bg-secondary hover:bg-secondary/70 focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-3.5 type-caption outline-none transition-colors focus-visible:ring-3"
          >
            {chip.label}
            <X className="text-muted-foreground size-3.5" />
            <span className="sr-only">{t("removeFilter")}</span>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={path}
          scroll={false}
          className="text-muted-foreground hover:text-foreground px-2 type-caption underline-offset-4 hover:underline"
        >
          {t("clearAll")}
        </Link>
      </li>
    </ul>
  );
}
