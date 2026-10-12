import { SITE_URL } from "@/lib/site";
import { productPath, type Product } from "./product";

export function productDescription(p: Product): string {
  const colour = p.base_colour && p.base_colour !== "NA" ? `${p.base_colour.toLowerCase()} ` : "";
  const usage = p.usage && p.usage !== "NA" ? ` for ${p.usage.toLowerCase()} wear` : "";
  return `${p.name}: ${colour}${p.article_type.toLowerCase()} for ${p.gender.toLowerCase()}${usage}.`;
}

export function breadcrumbTrail(p: Product): { label: string; href: string }[] {
  const q = (params: Record<string, string>) => `/products?${new URLSearchParams(params)}`;
  return [
    { label: p.gender, href: q({ gender: p.gender }) },
    { label: p.master_category, href: q({ gender: p.gender, master_category: p.master_category }) },
    { label: p.article_type, href: q({ gender: p.gender, article_type: p.article_type }) },
  ];
}

/** schema.org Product + BreadcrumbList for a product page. */
export function productJsonLd(p: Product) {
  const url = `${SITE_URL}${productPath(p)}`;
  const trail = breadcrumbTrail(p);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": url,
      name: p.name,
      description: productDescription(p),
      image: [p.image.thumb_800],
      sku: String(p.id),
      category: [p.master_category, p.sub_category, p.article_type].join(" > "),
      ...(p.base_colour && p.base_colour !== "NA" ? { color: p.base_colour } : {}),
      audience: { "@type": "PeopleAudience", suggestedGender: p.gender },
      // Only once there is a published review: an empty rating is not valid structured data.
      ...(p.rating_count > 0 && p.rating_average !== null
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: Number(p.rating_average.toFixed(2)),
              reviewCount: p.rating_count,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
      offers: {
        "@type": "Offer",
        url,
        price: (p.price_cents / 100).toFixed(2),
        priceCurrency: p.currency,
        availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
    },
    {
      "@context": "https://schema.org",
      ...breadcrumbList([{ label: "Home", href: "/" }, ...trail, { label: p.name, href: productPath(p) }]),
    },
  ];
}

/** The body of a schema.org BreadcrumbList (`@type` and `itemListElement`) for site-relative links. */
export function breadcrumbList(items: { label: string; href: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: `${SITE_URL}${item.href}`,
    })),
  };
}

/** Serialize for a `<script type="application/ld+json">`; `<` is escaped so data can't close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
