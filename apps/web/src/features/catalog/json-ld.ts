import { SITE_URL } from "@/lib/site";
import type { Vocab } from "@/i18n/vocab";
import { categoryHref, type CatalogNav, type NavNode } from "./nav";
import { productPath, type Product } from "./product";

const identity = (name: string) => name;

/**
 * Meta болон JSON-LD тайлбар: "Нэр: өнгө · төрөл · хүйс · хэрэглээ". Үгсийг идэвхтэй хэл рүү
 * (`vocab`) хөрвүүлнэ, өгүүлбэр угсрахгүй тул хэл болгонд ижил бүтэцтэй.
 */
export function productDescription(p: Product, vocab?: Vocab): string {
  const colour = vocab?.colour ?? identity;
  const category = vocab?.category ?? identity;
  const gender = vocab?.gender ?? identity;
  const usage = vocab?.usage ?? identity;
  const parts = [
    p.base_colour && p.base_colour !== "NA" ? colour(p.base_colour) : null,
    category(p.article_type),
    gender(p.gender),
    p.usage && p.usage !== "NA" ? usage(p.usage) : null,
  ];
  return `${p.name}: ${parts.filter(Boolean).join(" · ")}.`;
}

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Nav-аас department болон бүлэг, дэд ангилал, төрлийн node-уудыг олно. Node-ын нэр харуулах нэр
 * ("Clothing") тул бүтээгдэхүүний ангиллын нэрийн slug-аар ("Apparel" -> "apparel") тулгана. Олдохгүй
 * бол null.
 */
function categoryNodes(p: Product, nav: CatalogNav): { department: string; nodes: NavNode[] } | null {
  const slugs = [p.master_category, p.sub_category, p.article_type].map(slugify);
  for (const department of nav.departments) {
    if (!department.genders.includes(p.gender)) continue;
    const nodes: NavNode[] = [];
    let level = department.groups;
    for (const slug of slugs) {
      const node = level.find((n) => n.slug === slug);
      if (!node) break;
      nodes.push(node);
      level = node.children;
    }
    if (nodes.length > 0) return { department: department.slug, nodes };
  }
  return null;
}

/**
 * Бүтээгдэхүүний хуудасны breadcrumb: хүйс, бүлэг, төрөл. `nav` байвал sitemap-д байгаа ангиллын
 * хуудас руу (`/c/...`), үгүй бол шүүлтүүртэй жагсаалт руу.
 */
export function breadcrumbTrail(p: Product, nav?: CatalogNav | null): { label: string; href: string }[] {
  const q = (params: Record<string, string>) => `/products?${new URLSearchParams(params)}`;
  const found = nav ? categoryNodes(p, nav) : null;
  const department = found ? categoryHref(found.department) : q({ gender: p.gender });
  const group = found?.nodes[0] ? categoryHref(found.department, found.nodes[0].path) : q({ gender: p.gender, master_category: p.master_category });
  const type = found?.nodes[2] ? categoryHref(found.department, found.nodes[2].path) : q({ gender: p.gender, article_type: p.article_type });
  return [
    { label: p.gender, href: department },
    { label: p.master_category, href: group },
    { label: p.article_type, href: type },
  ];
}

export type JsonLdOptions = {
  vocab?: Vocab;
  /** "Нүүр" гэсэн нэр идэвхтэй хэлээр. */
  homeLabel?: string;
  nav?: CatalogNav | null;
};

/** Бүтээгдэхүүний хуудасны schema.org Product + BreadcrumbList. */
export function productJsonLd(p: Product, options: JsonLdOptions = {}) {
  const url = `${SITE_URL}${productPath(p)}`;
  const vocab = options.vocab;
  const trail = breadcrumbTrail(p, options.nav).map((crumb, i) => ({
    ...crumb,
    label: vocab ? (i === 0 ? vocab.gender(crumb.label) : vocab.category(crumb.label)) : crumb.label,
  }));
  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": url,
      name: p.name,
      description: productDescription(p, vocab),
      image: [p.image.thumb_800],
      sku: String(p.id),
      category: [p.master_category, p.sub_category, p.article_type].join(" > "),
      ...(p.base_colour && p.base_colour !== "NA" ? { color: p.base_colour } : {}),
      audience: { "@type": "PeopleAudience", suggestedGender: p.gender },
      // Нийтлэгдсэн сэтгэгдэл байгаа үед л: хоосон rating нь хүчинтэй structured data биш.
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
      ...breadcrumbList([{ label: options.homeLabel ?? "Home", href: "/" }, ...trail, { label: p.name, href: productPath(p) }]),
    },
  ];
}

/**
 * Сайттай харьцангуй холбоосуудад зориулсан schema.org BreadcrumbList-ийн бие (`@type`,
 * `itemListElement`).
 */
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

/**
 * `<script type="application/ld+json">`-д зориулж serialize хийнэ; `<`-ыг escape хийдэг тул өгөгдөл
 * tag-ийг хааж чадахгүй.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
