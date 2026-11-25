import { describe, expect, it } from "vitest";
import { createVocab } from "@/i18n/vocab";
import { catalogNav, makeProduct } from "@/test/fixtures";
import { breadcrumbTrail, productDescription, productJsonLd, serializeJsonLd } from "./json-ld";
import { formatPrice, productPath, productSubtitle } from "./product";
import { sizesFor } from "./sizes";

describe("product helpers", () => {
  it("formats minor units as currency, tugrik whole and dropping .00", () => {
    expect(formatPrice(8_790_000)).toBe("₮87,900"); // төгрөг, бутархайгүй
    expect(formatPrice(3499, "USD")).toBe("$34.99");
    expect(formatPrice(2500, "USD")).toBe("$25");
    expect(formatPrice(499, "EUR", "de-DE")).toContain("4,99");
  });

  it("builds the canonical path from id and slug", () => {
    expect(productPath(makeProduct())).toBe("/products/41885/alma-women-blue-kurta-60000");
  });

  it("describes colour and type", () => {
    expect(productSubtitle(makeProduct(), createVocab("en"))).toBe("Blue · Kurtas");
    expect(productSubtitle(makeProduct({ base_colour: null }), createVocab("en"))).toBe("Kurtas");
  });

  it("translates colour and type into Mongolian", () => {
    expect(productSubtitle(makeProduct(), createVocab("mn"))).toBe("Цэнхэр · Курта");
  });
});

describe("sizesFor", () => {
  it("gives clothing, shoe and kids sizes by category", () => {
    expect(sizesFor(makeProduct())?.sizes).toContain("XL");
    expect(sizesFor(makeProduct({ master_category: "Footwear", sub_category: "Shoes" }))?.label).toBe("sizeUs");
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

  it("links breadcrumbs to the category pages when the category tree is known", () => {
    const shirt = makeProduct({ gender: "Men", master_category: "Apparel", sub_category: "Topwear", article_type: "Tshirts" });

    expect(breadcrumbTrail(shirt, catalogNav).map((c) => c.href)).toEqual([
      "/c/men",
      "/c/men/apparel",
      "/c/men/apparel/topwear/tshirts",
    ]);
  });

  it("falls back to the filtered listing for a category the tree does not have", () => {
    const odd = makeProduct({ gender: "Men", master_category: "Apparel", sub_category: "Topwear", article_type: "Ponchos" });

    expect(breadcrumbTrail(odd, catalogNav).map((c) => c.href)).toEqual([
      "/c/men",
      "/c/men/apparel",
      "/products?gender=Men&article_type=Ponchos",
    ]);
  });
});

describe("product description and JSON-LD language", () => {
  it("is built from vocabulary terms, not English sentence fragments", () => {
    const product = makeProduct({ base_colour: "Blue", usage: "Casual" });

    expect(productDescription(product)).toBe("Alma Women Blue Kurta: Blue · Kurtas · Women · Casual.");
    const mn = productDescription(product, createVocab("mn"));
    expect(mn).toContain("Alma Women Blue Kurta:");
    expect(mn).not.toContain("Blue ·");
    expect(mn).not.toContain(" for ");
  });

  it("uses the shop's own word for Home and the translated category names in the breadcrumb data", () => {
    const [, crumbs] = productJsonLd(makeProduct(), { vocab: createVocab("mn"), homeLabel: "Нүүр" }) as unknown as { itemListElement: { name: string }[] }[];

    expect(crumbs?.itemListElement[0]?.name).toBe("Нүүр");
    expect(crumbs?.itemListElement[1]?.name).toBe(createVocab("mn").gender("Women"));
  });
});
