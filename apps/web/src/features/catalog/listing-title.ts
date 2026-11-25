import type { Vocab } from "@/i18n/vocab";
import type { ListingQuery } from "./filters";

type T = (key: "resultsFor" | "whoWhat" | "newArrivals" | "allProducts", values?: Record<string, string>) => string;

/** Хамгийн тодорхой шүүлтүүрээс гаргасан жагсаалтын хүнд ойлгомжтой гарчиг. */
export function listingTitle(query: ListingQuery, t: T, vocab: Vocab): string {
  if (query.q) return t("resultsFor", { query: query.q });
  const kids = query.gender.length === 2 && query.gender.includes("Boys") && query.gender.includes("Girls");
  const who = kids ? vocab.gender("Kids") : query.gender.length === 1 ? vocab.gender(query.gender[0]!) : "";
  const rawWhat = query.article_type[0] ?? query.sub_category[0] ?? query.master_category[0] ?? "";
  const what = rawWhat && vocab.category(rawWhat);
  if (who && what) return t("whoWhat", { who, what });
  if (who || what) return `${who || what}`;
  return query.sort === "newest" && !query.gender.length ? t("newArrivals") : t("allProducts");
}
