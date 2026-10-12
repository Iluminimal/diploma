import { randomUUID } from "node:crypto";
import type { APIRequestContext, Cookie } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, PASSWORD } from "./env";
import { makePng } from "./images";

export type CatalogProduct = {
  id: number;
  slug: string;
  name: string;
  price_cents: number;
  in_stock: boolean;
  article_type: string;
  master_category: string;
  image: { thumb_400: string; thumb_800: string };
};

export type Account = {
  email: string;
  password: string;
  token: string;
  cookies: Cookie[];
};

const json = { "content-type": "application/json" };

async function ok<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>, what: string): Promise<T> {
  if (!response.ok()) throw new Error(`${what} failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as T;
}

/** In-stock apparel (it has sizes), newest first. Tests pick different ones so they never fight over stock. */
export async function inStockProducts(request: APIRequestContext, count = 12): Promise<CatalogProduct[]> {
  const page = await ok<{ items: CatalogProduct[] }>(
    await request.get(`${API_URL}/api/v1/products`, {
      params: { in_stock: "true", master_category: "Apparel", page_size: count },
    }),
    "listing products",
  );
  if (page.items.length === 0) throw new Error("The catalogue has no in-stock apparel: seed it first.");
  return page.items;
}

/** A fresh US number for a phone sign-up. `make e2e-clean` removes accounts in this range. */
export const uniquePhone = () => `+1415555${String(Math.floor(Math.random() * 9000) + 1000)}`;

/** The one-time code every challenge has when the API runs with OTP_DEV_CODE=000000. */
export const OTP_CODE = "000000";

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** A new customer, created through the API so tests do not spend time (or the register rate limit) on the form. */
export async function registerAccount(request: APIRequestContext, label = "shopper"): Promise<Account> {
  const email = uniqueEmail(label);
  const body = await ok<{ access_token: string }>(
    await request.post(`${API_URL}/api/v1/auth/register`, {
      headers: json,
      data: { email, password: PASSWORD, full_name: "E2E Shopper" },
    }),
    "registering",
  );
  return { email, password: PASSWORD, token: body.access_token, cookies: (await request.storageState()).cookies };
}

export async function signInAccount(request: APIRequestContext, email: string, password: string): Promise<Account> {
  const body = await ok<{ access_token: string }>(
    await request.post(`${API_URL}/api/v1/auth/login`, { headers: json, data: { email, password } }),
    "signing in",
  );
  return { email, password, token: body.access_token, cookies: (await request.storageState()).cookies };
}

const bearer = (account: Account) => ({ ...json, Authorization: `Bearer ${account.token}` });

/** Adds to the cart in size M, or in the first size the product has (kids' and shoes have others), or in no size at all. */
export async function addToCart(request: APIRequestContext, account: Account, productId: number, quantity = 1) {
  let size = "M";
  for (let attempt = 0; ; attempt += 1) {
    const response = await request.post(`${API_URL}/api/v1/cart/items`, {
      headers: bearer(account),
      data: { product_id: productId, size, quantity },
    });
    if (response.ok()) return;
    const problem = (await response.json().catch(() => ({}))) as { type?: string; sizes?: string[] };
    if (attempt === 0 && problem.type === "urn:angel:problem:invalid-size" && problem.sizes) {
      // Kids' and shoe sizes differ; a bag or a watch has none, which is a size of "".
      size = problem.sizes[0] ?? "";
      continue;
    }
    throw new Error(`adding to the cart failed: ${response.status()} ${JSON.stringify(problem)}`);
  }
}

export async function addAddress(request: APIRequestContext, account: Account): Promise<number> {
  const address = await ok<{ id: number }>(
    await request.post(`${API_URL}/api/v1/addresses`, {
      headers: bearer(account),
      data: {
        full_name: "Ada Lovelace",
        line1: "12 Analytical Way",
        city: "London",
        postal_code: "N1 9GU",
        country: "GB",
        is_default: true,
      },
    }),
    "saving an address",
  );
  return address.id;
}

/** A paid order, placed the way the demo checkout does it. Returns its number. */
export async function placePaidOrder(request: APIRequestContext, account: Account, productId: number): Promise<string> {
  await addToCart(request, account, productId);
  const addressId = await addAddress(request, account);
  const checkout = await ok<{ order: { number: string } }>(
    await request.post(`${API_URL}/api/v1/checkout`, {
      headers: { ...bearer(account), "Idempotency-Key": `e2e-${randomUUID()}` },
      data: { address_id: addressId, shipping_method: "standard" },
    }),
    "checking out",
  );
  await ok(
    await request.post(`${API_URL}/api/v1/checkout/orders/${checkout.order.number}/simulate-payment`, {
      headers: bearer(account),
    }),
    "paying",
  );
  return checkout.order.number;
}

/** The bytes of a catalogue product's own photo: searching with it must find that product first. */
export async function productPhoto(request: APIRequestContext, product: CatalogProduct): Promise<Buffer> {
  const response = await request.get(product.image.thumb_800);
  if (!response.ok()) throw new Error(`could not fetch ${product.image.thumb_800}`);
  return Buffer.from(await response.body());
}

export async function saveToWishlist(request: APIRequestContext, account: Account, productId: number) {
  const response = await request.put(`${API_URL}/api/v1/wishlist/${productId}`, { headers: bearer(account) });
  if (!response.ok()) throw new Error(`saving to the wishlist failed: ${response.status()}`);
}

/** The e2e administrator, signed in through the API. */
export const adminSession = (request: APIRequestContext) => signInAccount(request, ADMIN_EMAIL, ADMIN_PASSWORD);

/** An order that has been placed but not paid (stock is held for it until it is paid or expires). */
export async function placePendingOrder(request: APIRequestContext, account: Account, productId: number): Promise<string> {
  await addToCart(request, account, productId);
  const addressId = await addAddress(request, account);
  const checkout = await ok<{ order: { number: string } }>(
    await request.post(`${API_URL}/api/v1/checkout`, {
      headers: { ...bearer(account), "Idempotency-Key": `e2e-${randomUUID()}` },
      data: { address_id: addressId, shipping_method: "standard" },
    }),
    "checking out",
  );
  return checkout.order.number;
}

/**
 * A product of this test's own (named "E2E ...", which `make e2e-clean` removes), so tests that
 * change stock or buy it cannot disturb each other or the catalogue other specs read. Use the
 * `newProduct` fixture rather than calling this: it withdraws the product when the test is over.
 */
export async function createProduct(
  request: APIRequestContext,
  admin: Account,
  options: { name?: string; stock?: number } = {},
): Promise<{ id: number; name: string }> {
  const categories = await ok<{ id: number; article_type: string }[]>(
    await request.get(`${API_URL}/api/v1/admin/categories`, { headers: bearer(admin) }),
    "listing categories",
  );
  // Not apparel: other specs pick "the newest in-stock apparel", and a product made from a
  // photo must not be one of them (see `newProduct` in fixtures.ts, which also withdraws it).
  const category = categories.find((c) => c.article_type === "Handbags") ?? categories[0]!;
  const name = options.name ?? `E2E handbag ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const created = await ok<{ id: number }>(
    await request.post(`${API_URL}/api/v1/admin/products`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      multipart: {
        name,
        category_id: String(category.id),
        gender: "Women",
        price_cents: "2999",
        stock_quantity: String(options.stock ?? 20),
        file: { name: "p.png", mimeType: "image/png", buffer: makePng(Math.floor(Math.random() * 1_000_000)) },
      },
    }),
    "creating a product",
  );
  return { id: created.id, name };
}

/** Take a product off sale (products are never deleted: orders refer to them). */
export async function withdrawProduct(request: APIRequestContext, admin: Account, productId: number) {
  await request.post(`${API_URL}/api/v1/admin/products/${productId}/deactivate`, { headers: bearer(admin) });
}

/** What the shop's own books say about a product (the storefront only shows "in stock"). */
export async function stockOf(request: APIRequestContext, admin: Account, productId: number): Promise<number> {
  const product = await ok<{ stock_quantity: number }>(
    await request.get(`${API_URL}/api/v1/admin/products/${productId}`, { headers: bearer(admin) }),
    "reading a product",
  );
  return product.stock_quantity;
}

/** The customer's view of an order, as the API gives it. */
export async function orderOf(request: APIRequestContext, account: Account, number: string) {
  return ok<{ status: string; tracking_number: string | null; events: { type: string }[] }>(
    await request.get(`${API_URL}/api/v1/orders/${number}`, { headers: bearer(account) }),
    "reading an order",
  );
}

/** Ships and delivers an order as the administrator does (the carrier and number are made up). */
export async function shipAndDeliver(request: APIRequestContext, admin: Account, number: string) {
  await ok(
    await request.post(`${API_URL}/api/v1/admin/orders/${number}/ship`, {
      headers: bearer(admin),
      data: { carrier: "DHL", tracking_number: "E2E-0146" },
    }),
    "shipping",
  );
  await ok(await request.post(`${API_URL}/api/v1/admin/orders/${number}/deliver`, { headers: bearer(admin) }), "delivering");
}

export async function postReview(
  request: APIRequestContext,
  account: Account,
  productId: number,
  review: { rating: number; title?: string; body?: string },
) {
  await ok(
    await request.post(`${API_URL}/api/v1/products/${productId}/reviews`, { headers: bearer(account), data: review }),
    "reviewing",
  );
}

export async function userId(request: APIRequestContext, account: Account): Promise<number> {
  const me = await ok<{ id: number }>(await request.get(`${API_URL}/api/v1/auth/me`, { headers: bearer(account) }), "reading the account");
  return me.id;
}

/** A phone-only customer, created through the API (a code that is always `OTP_CODE`). */
export async function signUpWithPhone(request: APIRequestContext, phone: string): Promise<Account & { phone: string }> {
  await ok(await request.post(`${API_URL}/api/v1/auth/otp/request`, { headers: json, data: { destination: phone } }), "asking for a code");
  const body = await ok<{ access_token: string }>(
    await request.post(`${API_URL}/api/v1/auth/otp/verify`, { headers: json, data: { destination: phone, code: OTP_CODE } }),
    "signing in with a code",
  );
  return { email: "", phone, password: "", token: body.access_token, cookies: (await request.storageState()).cookies };
}
