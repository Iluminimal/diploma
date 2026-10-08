import type { CatalogFilterOptions, Product, SearchResponse } from "@/features/catalog/product";

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 41885,
    slug: "alma-women-blue-kurta-60000",
    name: "Alma Women Blue Kurta",
    gender: "Women",
    master_category: "Apparel",
    sub_category: "Topwear",
    article_type: "Kurtas",
    base_colour: "Blue",
    season: "Fall",
    usage: "Ethnic",
    year: 2012,
    price_cents: 3499,
    currency: "USD",
    in_stock: true,
    image: {
      thumb_400: "http://localhost:8000/media/products/060/60000_400.webp",
      thumb_800: "http://localhost:8000/media/products/060/60000_800.webp",
      blur_data_url: null,
    },
    ...overrides,
  };
}

export const filterOptions: CatalogFilterOptions = {
  genders: ["Men", "Women"],
  colors: ["Black", "Blue", "White", "NA"],
  seasons: ["Fall", "Summer"],
  usages: ["Casual", "NA"],
  price_range: { min_cents: 499, max_cents: 35999 },
  categories: [
    {
      id: 1,
      name: "Apparel",
      slug: "apparel",
      path: "apparel",
      level: 1,
      children: [
        {
          id: 2,
          name: "Topwear",
          slug: "topwear",
          path: "apparel/topwear",
          level: 2,
          children: [
            { id: 3, name: "Shirts", slug: "shirts", path: "apparel/topwear/shirts", level: 3, children: [] },
            { id: 4, name: "Tshirts", slug: "tshirts", path: "apparel/topwear/tshirts", level: 3, children: [] },
          ],
        },
      ],
    },
  ],
};

export function makeSearchResponse(products: Product[] = [makeProduct()]): SearchResponse {
  return {
    results: products.map((product, i) => ({ product, similarity: 0.99 - i * 0.05 })),
    detected: [
      { article_type: "Shirts", category_path: "apparel/topwear/shirts", score: 0.62 },
      { article_type: "Tshirts", category_path: "apparel/topwear/tshirts", score: 0.21 },
    ],
    timings: { db_ms: 10, total_ms: 58, decode_ms: 5, embed_ms: 40 },
    cached: false,
  };
}

import type { Cart, CartLine } from "@/features/cart/cart-api";

export function makeCartLine(overrides: Partial<CartLine> = {}): CartLine {
  const product = overrides.product ?? makeProduct();
  const quantity = overrides.quantity ?? 1;
  return {
    id: 1,
    product,
    size: "M",
    quantity,
    unit_price_cents: product.price_cents,
    line_total_cents: product.price_cents * quantity,
    max_quantity: 7,
    issue: null,
    ...overrides,
  };
}

export function makeCart(lines: CartLine[] = []): Cart {
  return {
    lines,
    item_count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal_cents: lines.reduce((sum, line) => sum + line.line_total_cents, 0),
    currency: "USD",
    has_issues: lines.some((line) => line.issue),
  };
}
