import type {
  AdminCategory,
  AdminCustomer,
  AdminCustomerDetail,
  AdminOrder,
  AdminProduct,
  AdminReview,
  AdminStats,
} from "@/features/admin/admin-api";
import type { Review, ReviewPage } from "@/features/reviews/reviews-api";
import type { CatalogNav } from "@/features/catalog/nav";
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
    rating_average: null,
    rating_count: 0,
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

import type { Address } from "@/features/account/addresses-api";
import type { Order } from "@/features/orders/orders-api";

export function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 1,
    full_name: "Ada Lovelace",
    line1: "12 Analytical Way",
    line2: null,
    city: "London",
    region: null,
    postal_code: "N1 9GU",
    country: "GB",
    phone: null,
    is_default: true,
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  const product = makeProduct();
  return {
    number: "LK-ABCD2345",
    status: "paid",
    created_at: "2026-10-08T10:00:00Z",
    paid_at: "2026-10-08T10:00:05Z",
    shipped_at: null,
    delivered_at: null,
    refunded_at: null,
    carrier: null,
    tracking_number: null,
    events: [],
    currency: "USD",
    subtotal_cents: product.price_cents * 2,
    shipping_cents: 499,
    total_cents: product.price_cents * 2 + 499,
    shipping_method: "standard",
    shipping_address: {
      full_name: "Ada Lovelace",
      line1: "12 Analytical Way",
      city: "London",
      postal_code: "N1 9GU",
      country: "GB",
    },
    contact_email: "ada@example.com",
    items: [
      {
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.image,
        size: "M",
        unit_price_cents: product.price_cents,
        quantity: 2,
        line_total_cents: product.price_cents * 2,
      },
    ],
    ...overrides,
  };
}

export function makeAdminCategory(overrides: Partial<AdminCategory> = {}): AdminCategory {
  return {
    id: 9,
    path: "apparel/topwear/shirts",
    master_category: "Apparel",
    sub_category: "Topwear",
    article_type: "Shirts",
    ...overrides,
  };
}

export function makeAdminProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  const { image, ...product } = makeProduct({ id: 7, name: "Linen camp shirt", article_type: "Shirts" });
  return {
    ...product,
    slug: "linen-camp-shirt-1a2b3c4d",
    category_id: 9,
    stock_quantity: 12,
    is_active: true,
    source_id: null,
    embedding_version: "fashion-clip@test",
    image,
    created_at: "2026-10-08T10:00:00Z",
    updated_at: "2026-10-08T10:00:00Z",
    ...overrides,
  };
}

export function makeAdminOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    ...makeOrder(),
    user_id: 3,
    cancel_reason: null,
    cancelled_at: null,
    payment: {
      provider: "offline",
      provider_payment_id: "pi_offline_123",
      status: "succeeded",
      amount_cents: 7497,
      currency: "USD",
      last_error: null,
      refund_id: null,
    },
    ...overrides,
  };
}

export const catalogNav: CatalogNav = {
  departments: [
    {
      slug: "men",
      name: "Men",
      genders: ["Men", "Unisex"],
      product_count: 300,
      groups: [
        {
          name: "Clothing",
          slug: "apparel",
          path: "apparel",
          level: 1,
          product_count: 300,
          children: [
            {
              name: "Topwear",
              slug: "topwear",
              path: "apparel/topwear",
              level: 2,
              product_count: 300,
              children: [
                { name: "T-shirts", slug: "tshirts", path: "apparel/topwear/tshirts", level: 3, product_count: 200, children: [] },
                { name: "Shirts", slug: "shirts", path: "apparel/topwear/shirts", level: 3, product_count: 100, children: [] },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: "women",
      name: "Women",
      genders: ["Women", "Unisex"],
      product_count: 120,
      groups: [
        {
          name: "Clothing",
          slug: "apparel",
          path: "apparel",
          level: 1,
          product_count: 120,
          children: [
            {
              name: "Topwear",
              slug: "topwear",
              path: "apparel/topwear",
              level: 2,
              product_count: 120,
              children: [
                { name: "T-shirts", slug: "tshirts", path: "apparel/topwear/tshirts", level: 3, product_count: 120, children: [] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const image = {
  thumb_400: "http://localhost:8000/media/products/060/60000_400.webp",
  thumb_800: "http://localhost:8000/media/products/060/60000_800.webp",
  blur_data_url: null,
};

export function makeStats(overrides: Partial<AdminStats> = {}): AdminStats {
  return {
    days: 7,
    currency: "USD",
    revenue_cents: { current: 150000, previous: 100000 },
    orders: { current: 12, previous: 12 },
    units: { current: 20, previous: 15 },
    new_customers: { current: 0, previous: 4 },
    average_order_cents: { current: 12500, previous: 8333 },
    series: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-0${i + 1}`,
      revenue_cents: i === 3 ? 60000 : i * 5000,
      orders: i === 3 ? 4 : i,
    })),
    status_counts: { paid: 3, pending: 2, shipped: 4, delivered: 20 },
    to_ship: 3,
    awaiting_payment: 2,
    low_stock_threshold: 5,
    low_stock: [{ id: 7, name: "Slim Fit Chinos", slug: "slim-fit-chinos-7", stock_quantity: 2, image }],
    low_stock_total: 1,
    out_of_stock_total: 4,
    top_products: [
      { product_id: 41885, name: "Alma Women Blue Kurta", slug: "alma-women-blue-kurta-60000", image, units: 9, revenue_cents: 31491 },
    ],
    recent_orders: [
      {
        number: "LK-ABCD2345",
        status: "paid",
        created_at: "2026-10-08T10:00:00Z",
        currency: "USD",
        total_cents: 7497,
        item_count: 2,
        customer_email: "ada@example.com",
        customer_name: "Ada Lovelace",
        payment_status: "succeeded",
      },
    ],
    ...overrides,
  };
}

export function makeAdminCustomer(overrides: Partial<AdminCustomer> = {}): AdminCustomer {
  return {
    id: 3,
    email: "ada@example.com",
    phone: null,
    full_name: "Ada Lovelace",
    avatar_url: null,
    is_active: true,
    created_at: "2026-08-01T09:00:00Z",
    orders_count: 4,
    total_spent_cents: 18250,
    last_order_at: "2026-10-05T12:00:00Z",
    ...overrides,
  };
}

export function makeAdminCustomerDetail(overrides: Partial<AdminCustomerDetail> = {}): AdminCustomerDetail {
  return {
    ...makeAdminCustomer(),
    providers: [],
    has_password: true,
    recent_orders: [
      {
        number: "LK-ABCD2345",
        status: "delivered",
        created_at: "2026-10-05T12:00:00Z",
        currency: "USD",
        total_cents: 7497,
        item_count: 2,
        customer_email: "ada@example.com",
        customer_name: "Ada Lovelace",
        payment_status: "succeeded",
      },
    ],
    ...overrides,
  };
}

export function makeAdminReview(overrides: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 11,
    rating: 4,
    title: "Nice fit",
    body: "Runs a little large.",
    author: "Ada L.",
    status: "published",
    created_at: "2026-10-07T08:00:00Z",
    updated_at: "2026-10-07T08:00:00Z",
    user_id: 3,
    author_email: "ada@example.com",
    author_phone: null,
    product: {
      id: 41885,
      name: "Alma Women Blue Kurta",
      slug: "alma-women-blue-kurta-60000",
      image: {
        thumb_400: "http://localhost:8000/media/products/060/60000_400.webp",
        thumb_800: "http://localhost:8000/media/products/060/60000_800.webp",
        blur_data_url: null,
      },
    },
    ...overrides,
  };
}

export function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 11,
    rating: 4,
    title: "Nice fit",
    body: "Runs a little large.",
    author: "Ada L.",
    status: "published",
    created_at: "2026-10-07T08:00:00Z",
    updated_at: "2026-10-07T08:00:00Z",
    ...overrides,
  };
}

export function makeReviewPage(overrides: Partial<ReviewPage> = {}): ReviewPage {
  const items = [makeReview(), makeReview({ id: 12, rating: 5, title: "Perfect", body: null, author: "Bob K." })];
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 5,
    pages: 1,
    summary: { average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] },
    viewer: null,
    ...overrides,
  };
}
