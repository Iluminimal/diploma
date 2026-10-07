import type { ListingQuery } from "./filters";

/** Human heading for a listing, derived from the most telling filters. */
export function listingTitle(query: ListingQuery): string {
  if (query.q) return `Results for “${query.q}”`;
  const kids = query.gender.length === 2 && query.gender.includes("Boys") && query.gender.includes("Girls");
  const who = kids ? "Kids" : query.gender.length === 1 ? query.gender[0] : "";
  const what = query.article_type[0] ?? query.sub_category[0] ?? query.master_category[0] ?? "";
  if (who && what) return `${who}: ${what}`;
  if (who || what) return `${who || what}`;
  return query.sort === "newest" && !query.gender.length ? "New arrivals" : "All products";
}
