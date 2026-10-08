import { randomUUID } from "node:crypto";
import type { APIRequestContext, Cookie } from "@playwright/test";
import { API_URL, PASSWORD } from "./env";

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

export async function addToCart(request: APIRequestContext, account: Account, productId: number, quantity = 1) {
  await ok(
    await request.post(`${API_URL}/api/v1/cart/items`, {
      headers: bearer(account),
      data: { product_id: productId, size: "M", quantity },
    }),
    "adding to the cart",
  );
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
