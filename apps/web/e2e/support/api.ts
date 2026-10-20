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

/**
 * Нөөцтэй хувцас (хэмжээтэй), шинэ нь эхэнд. Тестүүд нөөцөөр зөрчилдөхгүйн тулд өөр өөр бараа
 * сонгоно.
 */
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

/** Утасны бүртгэлд зориулсан шинэ US дугаар. `make e2e-clean` энэ мужийн account-уудыг устгана. */
export const uniquePhone = () => `+1415555${String(Math.floor(Math.random() * 9000) + 1000)}`;

/** API-г OTP_DEV_CODE=000000-тэй ажиллуулахад challenge бүрийн нэг удаагийн код. */
export const OTP_CODE = "000000";

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/**
 * API-аар үүсгэсэн шинэ хэрэглэгч: тест форм дээр (мөн бүртгэлийн rate limit-д) хугацаа үрэхгүй.
 */
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

/**
 * M хэмжээгээр, эсвэл бараанд байгаа эхний хэмжээгээр (хүүхдийн болон гутлынх өөр), эсвэл хэмжээгүй
 * нэмнэ.
 */
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
      // Хүүхдийн болон гутлын хэмжээ өөр; цүнх, цаг хэмжээгүй бөгөөд тэр нь "" утга.
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

/** Төлөгдсөн захиалга, demo checkout-ийн адил оруулсан. Дугаарыг нь буцаана. */
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

/** Каталогийн барааны өөрийн зургийн bytes: үүгээр хайхад тэр бараа эхэлж гарах ёстой. */
export async function productPhoto(request: APIRequestContext, product: CatalogProduct): Promise<Buffer> {
  const response = await request.get(product.image.thumb_800);
  if (!response.ok()) throw new Error(`could not fetch ${product.image.thumb_800}`);
  return Buffer.from(await response.body());
}

export async function saveToWishlist(request: APIRequestContext, account: Account, productId: number) {
  const response = await request.put(`${API_URL}/api/v1/wishlist/${productId}`, { headers: bearer(account) });
  if (!response.ok()) throw new Error(`saving to the wishlist failed: ${response.status()}`);
}

/** API-аар нэвтэрсэн e2e админ. */
export const adminSession = (request: APIRequestContext) => signInAccount(request, ADMIN_EMAIL, ADMIN_PASSWORD);

/** Оруулсан боловч төлөгдөөгүй захиалга (төлөх эсвэл хугацаа дуустал нөөцийг нь барьж байна). */
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
 * Энэ тестийн өөрийн бараа ("E2E ..." нэртэй, `make e2e-clean` устгана): нөөц өөрчлөх эсвэл
 * худалдан авдаг тестүүд бие биедээ болон бусад spec-ийн уншдаг каталогт саад болохгүй. Үүнийг шууд
 * дуудахын оронд `newProduct` fixture ашигла: тест дуусахад бараа хасагдана.
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
  // Хувцас биш: бусад spec "хамгийн сүүлийн нөөцтэй хувцас"-ыг сонгодог, зургаас үүсгэсэн бараа
  // тэдгээрийн нэг байж болохгүй (`newProduct` fixture-ийг fixtures.ts-ээс үз, тэр нь бас хасдаг).
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

/** Барааг борлуулалтаас хасна (бараа хэзээ ч устгагдахгүй: захиалгууд лавладаг). */
export async function withdrawProduct(request: APIRequestContext, admin: Account, productId: number) {
  await request.post(`${API_URL}/api/v1/admin/products/${productId}/deactivate`, { headers: bearer(admin) });
}

/** Дэлгүүрийн өөрийн бүртгэл барааны талаар юу гэдэг (storefront зөвхөн "нөөцтэй" гэж харуулна). */
export async function stockOf(request: APIRequestContext, admin: Account, productId: number): Promise<number> {
  const product = await ok<{ stock_quantity: number }>(
    await request.get(`${API_URL}/api/v1/admin/products/${productId}`, { headers: bearer(admin) }),
    "reading a product",
  );
  return product.stock_quantity;
}

/** Худалдан авагчийн харах захиалга, API-ийн өгснөөр. */
export async function orderOf(request: APIRequestContext, account: Account, number: string) {
  return ok<{ status: string; tracking_number: string | null; events: { type: string }[] }>(
    await request.get(`${API_URL}/api/v1/orders/${number}`, { headers: bearer(account) }),
    "reading an order",
  );
}

/** Админ шиг захиалгыг илгээж, хүргэнэ (тээвэрлэгч ба дугаар зохиомол). */
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

/** Зөвхөн утастай хэрэглэгч, API-аар үүсгэсэн (код нь үргэлж `OTP_CODE`). */
export async function signUpWithPhone(request: APIRequestContext, phone: string): Promise<Account & { phone: string }> {
  await ok(await request.post(`${API_URL}/api/v1/auth/otp/request`, { headers: json, data: { destination: phone } }), "asking for a code");
  const body = await ok<{ access_token: string }>(
    await request.post(`${API_URL}/api/v1/auth/otp/verify`, { headers: json, data: { destination: phone, code: OTP_CODE } }),
    "signing in with a code",
  );
  return { email: "", phone, password: "", token: body.access_token, cookies: (await request.storageState()).cookies };
}
