import type { components } from "@/lib/api/client";

export type Product = components["schemas"]["ProductOut"];
export type SearchHit = components["schemas"]["SearchHit"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type CatalogFilterOptions = components["schemas"]["CatalogFilters"];
export type CategoryNode = components["schemas"]["CategoryNode"];

/**
 * Бүтээгдэхүүний каноник зам: `/products/{id}/{slug}`. Id нь хайлтын түлхүүр; slug нь хүн болон
 * SEO-д.
 */
export function productPath(product: Pick<Product, "id" | "slug">): string {
  return `/products/${product.id}/${product.slug}`;
}

export function formatPrice(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Бүтээгдэхүүний нэрийн доорх нэг мөрийн тайлбар, жишээ нь "Blue · Kurtas". */
export function productSubtitle(p: Pick<Product, "article_type" | "base_colour">): string {
  return [p.base_colour, p.article_type].filter(Boolean).join(" · ");
}
