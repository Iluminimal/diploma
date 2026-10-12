import { describe, expect, it } from "vitest";
import { makeProduct } from "@/test/fixtures";
import { breadcrumbTrail, productJsonLd, serializeJsonLd } from "./json-ld";
import { formatPrice, productPath, productSubtitle } from "./product";
import { sizesFor } from "./sizes";

describe("product helpers", () => {
  it("formats cents as currency, dropping .00", () => {
    expect(formatPrice(3499)).toBe("$34.99");
    expect(formatPrice(2500)).toBe("$25");
    expect(formatPrice(499, "EUR", "de-DE")).toContain("4,99");
  });

  it("builds the canonical path from id and slug", () => {
    expect(productPath(makeProduct())).toBe("/products/41885/alma-women-blue-kurta-60000");
  });

  it("describes colour and type", () => {
    expect(productSubtitle(makeProduct())).toBe("Blue · Kurtas");
    expect(productSubtitle(makeProduct({ base_colour: null }))).toBe("Kurtas");
  });
});

describe("sizesFor", () => {
  it("gives clothing, shoe and kids sizes by category", () => {
    expect(sizesFor(makeProduct())?.sizes).toContain("XL");
    expect(sizesFor(makeProduct({ master_category: "Footwear", sub_category: "Shoes" }))?.label).toBe("Size (US)");
    expect(sizesFor(makeProduct({ gender: "Girls" }))?.sizes[0]).toBe("2-3Y");
  });

  it("shows no selector for items without sizes", () => {
    expect(sizesFor(makeProduct({ master_category: "Accessories", sub_category: "Watches" }))).toBeNull();
  });
});

type Ld = {
  "@type": string;
  offers?: { availability: string };
  itemListElement?: { position: number; item: string }[];
  [key: string]: unknown;
};
const jsonLd = (p: ReturnType<typeof makeProduct>) => productJsonLd(p) as unknown as Ld[];

describe("product JSON-LD", () => {
  it("emits a Product with an Offer and a BreadcrumbList", () => {
    const [product, crumbs] = jsonLd(makeProduct());
    expect(product).toMatchObject({
      "@type": "Product",
      name: "Alma Women Blue Kurta",
      color: "Blue",
      sku: "41885",
      offers: { price: "34.99", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    });
    expect(crumbs?.["@type"]).toBe("BreadcrumbList");
    expect(crumbs?.itemListElement?.map((i) => i.position)).toEqual([1, 2, 3, 4, 5]);
    expect(crumbs?.itemListElement?.at(-1)?.item).toContain("/products/41885/alma-women-blue-kurta-60000");
  });

  it("adds the aggregate rating once the product has reviews", () => {
    const [product] = jsonLd(makeProduct({ rating_average: 4.5, rating_count: 12 }));

    expect(product?.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it("leaves the rating out when there are no reviews (an empty rating is not valid)", () => {
    const [product] = jsonLd(makeProduct({ rating_average: null, rating_count: 0 }));

    expect(product).not.toHaveProperty("aggregateRating");
  });

  it("marks sold-out products as OutOfStock", () => {
    const [product] = jsonLd(makeProduct({ in_stock: false }));
    expect(product?.offers?.availability).toBe("https://schema.org/OutOfStock");
  });

  it("escapes `<` so product data can never close the script tag", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });

  it("links breadcrumbs to filtered listings", () => {
    expect(breadcrumbTrail(makeProduct()).map((c) => c.href)).toEqual([
      "/products?gender=Women",
      "/products?gender=Women&master_category=Apparel",
      "/products?gender=Women&article_type=Kurtas",
    ]);
  });
});
