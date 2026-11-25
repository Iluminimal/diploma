import { BASE_CURRENCY, formatMoney } from "@/i18n/currency";
import type { Vocab } from "@/i18n/vocab";
import type { components } from "@/lib/api/client";

export type Product = components["schemas"]["ProductOut"];
export type SearchHit = components["schemas"]["SearchHit"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type AppliedFilter = components["schemas"]["AppliedFilter"];
export type CatalogFilterOptions = components["schemas"]["CatalogFilters"];
export type CategoryNode = components["schemas"]["CategoryNode"];

/**
 * Бүтээгдэхүүний каноник зам: `/products/{id}/{slug}`. Id нь хайлтын түлхүүр; slug нь хүн болон
 * SEO-д.
 */
export function productPath(product: Pick<Product, "id" | "slug">): string {
  return `/products/${product.id}/${product.slug}`;
}

/** Admin, захиалгын түүхэд: `useFormat().price`-тэй ижил дүрслэл, гэхдээ hook-гүй. */
export function formatPrice(cents: number, currency: string = BASE_CURRENCY, locale = "en-US"): string {
  return formatMoney(cents, currency, locale);
}

/** Бүтээгдэхүүний нэрийн доорх нэг мөрийн тайлбар, жишээ нь "Blue · Kurtas". */
export function productSubtitle(p: Pick<Product, "article_type" | "base_colour">, vocab: Vocab): string {
  return [p.base_colour && vocab.colour(p.base_colour), p.article_type && vocab.category(p.article_type)]
    .filter(Boolean)
    .join(" · ");
}
