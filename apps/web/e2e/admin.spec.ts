import { test, expect } from "./fixtures";
import { placePaidOrder } from "./support/api";
import { API_URL } from "./support/env";
import { makePng } from "./support/images";
import type { APIRequestContext } from "@playwright/test";

/** Энэ зургаар visual search хайхад хамгийн эхэнд гарах барааны id. */
async function topResult(api: APIRequestContext, png: Buffer): Promise<number> {
  const response = await api.post(`${API_URL}/api/v1/search/image`, {
    multipart: { file: { name: "q.png", mimeType: "image/png", buffer: png }, limit: "5" },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).results[0].product.id as number;
}

/**
 * Visual search энэ зургийг өгөгдсөн бараатай хэр төстэй гэж үзэхийг буцаана (үр дүнд байхгүй бол
 * null).
 */
async function similarityTo(api: APIRequestContext, png: Buffer, productId: number): Promise<number | null> {
  const response = await api.post(`${API_URL}/api/v1/search/image`, {
    multipart: { file: { name: "q.png", mimeType: "image/png", buffer: png }, limit: "60" },
  });
  const hit = ((await response.json()).results as { product: { id: number }; similarity: number }[]).find(
    (result) => result.product.id === productId,
  );
  return hit?.similarity ?? null;
}

const photo = (png: Buffer) => ({ name: "product.png", mimeType: "image/png", buffer: png });

test("customers and visitors cannot use the admin area", async ({ shopperPage: page, browser }) => {
  const adminCalls: string[] = [];
  page.on("request", (request) => request.url().includes("/api/v1/admin") && adminCalls.push(request.url()));

  await page.goto("/admin/products");

  await expect(page.getByText("You don't have access to this area")).toBeVisible();
  expect(adminCalls).toEqual([]);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/admin/orders");
  await expect(visitor).toHaveURL(/\/login\?next=%2Fadmin%2Forders/);
});

test("the API refuses admin requests from anyone but an administrator", async ({ api, account }) => {
  const anonymous = await api.get(`${API_URL}/api/v1/admin/products`);
  const customer = await api.get(`${API_URL}/api/v1/admin/products`, { headers: { Authorization: `Bearer ${account.token}` } });

  expect(anonymous.status()).toBe(401);
  expect(customer.status()).toBe(403);
  expect((await customer.json()).type).toBe("urn:angel:problem:forbidden");
});

test("an administrator creates a product from a photo, edits it, replaces the photo and withdraws it", async ({
  adminPage: page,
  api,
}) => {
  const stamp = Date.now();
  const name = `E2E linen shirt ${stamp}`;
  const first = makePng(stamp % 100_000);
  const second = makePng((stamp + 7) % 100_000);

  // --- зургаас үүсгэх ---
  await page.goto("/admin/products/new");
  await page.getByLabel("Photo", { exact: true }).setInputFiles(photo(first));
  await expect(page.getByAltText("Preview of the chosen photo")).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Category").selectOption({ label: "Shirts" });
  await page.getByLabel("Colour (optional)").fill("Blue");
  await page.getByLabel("Price (USD)").fill("49.99");
  await page.getByLabel("Stock").fill("7");
  await page.getByRole("button", { name: "Create product" }).click();

  await expect(page).toHaveURL(/\/admin\/products\/\d+$/);
  const id = Number(page.url().split("/").pop());
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Шууд зарагдаж эхэлнэ: бичсэн үнээр, мөн visual search өөрийнх нь зургаар олно.
  const storefront = await (await api.get(`${API_URL}/api/v1/products/${id}`)).json();
  expect(storefront.price_cents).toBe(4999);
  expect(storefront.in_stock).toBe(true);
  expect(await topResult(api, first)).toBe(id);

  // --- үнэ засах ---
  await page.getByLabel("Price (USD)").fill("39.50");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(async () => (await (await api.get(`${API_URL}/api/v1/products/${id}`)).json()).price_cents)
    .toBe(3950);

  // --- зураг солих: хайлт шинэ зургийг олно ---
  await page.getByLabel("New photo").setInputFiles(photo(second));
  await page.getByRole("button", { name: "Replace photo" }).click();
  await expect(page.getByText("Photo replaced")).toBeVisible();
  expect(await topResult(api, second)).toBe(id);
  // Embedding одоо шинэ зургаас гарсан: шинэ зураг яг таарна, хуучин нь таарахаа больсон.
  expect(await similarityTo(api, second, id)).toBeGreaterThan(0.99);
  expect((await similarityTo(api, first, id)) ?? 0).toBeLessThan(0.99);

  // --- хасах (баталгаажуулалттай), жагсаалтаас нэрээр нь олох ---
  await page.goto(`/admin/products?q=${encodeURIComponent(name)}`);
  await page.getByRole("button", { name: `Withdraw ${name}` }).click();
  await page.getByRole("dialog", { name: "Withdraw this product?" }).getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByRole("button", { name: `Restore ${name}` })).toBeVisible();

  expect((await api.get(`${API_URL}/api/v1/products/${id}`)).status()).toBe(404);
  expect(await topResult(api, second)).not.toBe(id);

  // ...мөн буцаан нийтэлж болно.
  await page.getByRole("button", { name: `Restore ${name}` }).click();
  await expect(page.getByRole("button", { name: `Withdraw ${name}` })).toBeVisible();
  expect((await api.get(`${API_URL}/api/v1/products/${id}`)).status()).toBe(200);

  // API-ийн боломжоор өөрийнхөө үлдээсэн зүйлийг цэвэрлэнэ: хасагдсан төлөвт үлдээнэ.
  await page.getByRole("button", { name: `Withdraw ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByRole("button", { name: `Restore ${name}` })).toBeVisible();
});

test("a bad photo or bad details do not create a product", async ({ adminPage: page }) => {
  await page.goto("/admin/products/new");

  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByText("Enter a name")).toBeVisible();
  await expect(page.getByText("Choose a photo of the product.")).toBeVisible();

  await page.getByLabel("Photo", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByText("Use a JPEG, PNG or WebP photo.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/products\/new$/);
});

test("an administrator sees a customer's order with its payment", async ({ adminPage: page, api, account, products }, testInfo) => {
  const number = await placePaidOrder(api, account, products[testInfo.workerIndex % products.length]!.id);

  await page.goto(`/admin/orders?q=${number}`);
  await page.getByRole("link", { name: number }).click();

  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
  await expect(page.getByText(account.email).first()).toBeVisible();
  await expect(page.getByText("succeeded via offline")).toBeVisible();
  await expect(page.getByText("12 Analytical Way").first()).toBeVisible();
});
