import { test, expect } from "./fixtures";
import { productPhoto, type CatalogProduct } from "./support/api";
import { API_URL, FAKE_LOCALIZER, FAKE_MODEL } from "./support/env";
import { recordSearches } from "./support/recorder";
import type { APIRequestContext, Page } from "@playwright/test";

const results = (page: Page) => page.getByRole("status").filter({ hasText: /similar item|garments? found/ });
const photoInput = (page: Page) => page.locator('input[aria-label="Choose a photo"]');
const upload = (photo: Buffer) => ({ name: "photo.webp", mimeType: "image/webp", buffer: photo });

/**
 * API-ийн LOCALIZER=fake (CI) зураг бүрийг хоёр хувцас гэж үздэг тул хайлт эхлээд хувцас бүрээр бүлэглэгдэнэ.
 * Ангилал, үгээр нарийсгах гэх мэт нэг хувцасны харагдац шаардсан тест эхний хувцсыг нээнэ.
 */
async function openSingleView(page: Page) {
  const open = page.getByRole("button", { name: /See all matches/ }).first();
  const chip = page.getByRole("button", { name: /Detected:/ });
  await expect(open.or(chip).first()).toBeVisible();
  if (await open.isVisible()) await open.click();
  await expect(chip).toBeVisible();
}

async function ownPhoto(api: APIRequestContext, products: CatalogProduct[]) {
  const product = products[0]!;
  return { product, photo: await productPhoto(api, product) };
}

test("a photo search shows similar products with match badges and a detected category", async ({
  page,
  api,
  products,
}) => {
  const { product, photo } = await ownPhoto(api, products);
  await page.goto("/search");

  await photoInput(page).setInputFiles(upload(photo));

  await expect(results(page)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
  await expect(page.getByText(/\d+% match/).first()).toBeVisible();
  await openSingleView(page);
  if (!FAKE_MODEL) {
    // FashionCLIP browser-ийн дахин encode-ыг давж харна: барааны өөрийн зураг ялсаар байна.
    await expect(page.locator("article a").first()).toHaveAttribute("href", new RegExp(`^/products/${product.id}/`));
  }
});

test("every garment found in the photo gets its own results, and one can be opened", async ({
  page,
  api,
  products,
}) => {
  test.skip(!FAKE_LOCALIZER, "needs the API's deterministic LOCALIZER=fake");
  const { photo } = await ownPhoto(api, products);
  const searches = await recordSearches(page);
  await page.goto("/search");

  await photoInput(page).setInputFiles(upload(photo));

  await expect(page.getByRole("heading", { name: "Garment 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Garment 2" })).toBeVisible();
  await expect(results(page)).toContainText("2 garments found");
  expect((await searches.all()).filter((s) => s.url.endsWith("/search/garments"))).toHaveLength(1);
  await searches.clear();

  await page.getByRole("button", { name: /See all matches/ }).nth(1).click();

  await expect.poll(async () => (await searches.all()).flatMap((s) => s.fields)).toContain("region=1");
  await expect(page.getByRole("button", { name: "Search for garment 2" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All garments in this photo" }).click();
  await expect(page.getByRole("heading", { name: "Garment 1" })).toBeVisible();
});

test("through the API, every garment of a photo comes back with its own results", async ({ api, products }) => {
  test.skip(!FAKE_LOCALIZER, "needs the API's deterministic LOCALIZER=fake");
  const { photo } = await ownPhoto(api, products);

  const response = await api.post(`${API_URL}/api/v1/search/garments`, {
    multipart: { file: { name: "photo.webp", mimeType: "image/webp", buffer: photo }, limit: "4" },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.garments).toHaveLength(2);
  for (const garment of body.garments) expect(garment.results).toHaveLength(4);
  expect(body.garments[0].results[0].product.id).not.toBe(body.garments[1].results[0].product.id);
});

test("through the API, a catalogue photo finds its own product first with a near-perfect score", async ({
  api,
  products,
}) => {
  const { product, photo } = await ownPhoto(api, products);

  const response = await api.post(`${API_URL}/api/v1/search/image`, {
    multipart: { file: { name: "photo.webp", mimeType: "image/webp", buffer: photo }, limit: "5" },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.results[0].product.id).toBe(product.id);
  // Thumbnail нь embedding гарсан зургийн алдагдалтай хуулбар: маш ойр боловч яг ижил биш.
  expect(body.results[0].similarity).toBeGreaterThan(0.97);
  expect(body.results[1].similarity).toBeLessThan(body.results[0].similarity - 0.05);
  expect(body.detected.length).toBeGreaterThan(0);
});

test("the user can override the detected category", async ({ page, api, products }) => {
  const { photo } = await ownPhoto(api, products);
  const searches = await recordSearches(page);
  await page.goto("/search");
  await photoInput(page).setInputFiles(upload(photo));
  await expect(results(page)).toBeVisible();
  await openSingleView(page);
  await searches.clear();

  await page.getByRole("button", { name: /Detected:/ }).click();
  // "Any category" эхэнд байх бөгөөд дараагийн бүртгэл нь загварын олсон хамгийн магадлалтай
  // ангилал.
  const choice = page.getByRole("menuitemradio").nth(1);
  const category = (await choice.locator("span").first().innerText()).trim();
  await choice.click();

  await expect.poll(async () => (await searches.all()).length).toBeGreaterThan(0);
  const sent = (await searches.all()).flatMap((s) => s.fields);
  expect(sent).toContain(`article_type=${category}`);
  await expect(page.getByRole("button", { name: new RegExp(`Category: ${category}`) })).toBeVisible();
});

test("words refine the search (hybrid), and a filter chip narrows it", async ({ page, api, products }) => {
  const { photo } = await ownPhoto(api, products);
  const searches = await recordSearches(page);
  await page.goto("/search");
  await photoInput(page).setInputFiles(upload(photo));
  await expect(results(page)).toBeVisible();
  await searches.clear();

  await page.getByLabel("Refine with words").fill("in red");
  await page.getByRole("button", { name: "Refine" }).click();
  await expect.poll(async () => (await searches.all()).some((s) => s.url.endsWith("/search/hybrid"))).toBe(true);
  expect((await searches.all()).some((s) => s.fields.includes("query=in red"))).toBe(true);

  await searches.clear();
  await page.getByRole("button", { name: "Women", exact: true }).click();
  await expect.poll(async () => (await searches.all()).some((s) => s.fields.includes("gender=Women"))).toBe(true);
});

test("pasting an image starts a search", async ({ page, api, products }) => {
  const { photo } = await ownPhoto(api, products);
  await page.goto("/search");
  await page.waitForLoadState("networkidle"); // Listener-ийг React залгасан

  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted.webp", { type: "image/webp" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, photo.toString("base64"));

  await expect(results(page)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test("dropping an image starts a search", async ({ page, api, products }) => {
  const { photo } = await ownPhoto(api, products);
  await page.goto("/search");
  await page.waitForLoadState("networkidle");

  const dataTransfer = await page.evaluateHandle(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "dropped.webp", { type: "image/webp" }));
    return transfer;
  }, photo.toString("base64"));
  await page.getByText("Drop a photo here").dispatchEvent("drop", { dataTransfer });

  await expect(results(page)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test.describe("with a camera", () => {
  test.use({ permissions: ["camera"] });

  test("capturing a photo starts a search", async ({ page }) => {
    await page.goto("/search");

    await page.getByRole("button", { name: "Take a photo", exact: true }).click();
    const capture = page.getByRole("button", { name: "Capture" });
    await expect(capture).toBeEnabled();
    if (FAKE_LOCALIZER) {
      // Live preview: LOCALIZER=fake кадрыг дээд, доод хоёр хувцас гэж үздэг тул хоёр цэгэн хүрээ гарна.
      await expect(page.locator('[class*="border-dotted"]')).toHaveCount(2);
      await expect(page.getByRole("status").filter({ hasText: "2 garments" })).toBeVisible();
    }
    await capture.click();

    await expect(results(page)).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
  });
});

test("something that is not an image is refused with a clear message", async ({ page }) => {
  await page.goto("/search");

  await photoInput(page).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

  await expect(page.getByRole("alert").filter({ hasText: /isn't an image/ })).toBeVisible();
});

test("the API refuses an upload that is not an image, whatever the browser says", async ({ api }) => {
  const response = await api.post(`${API_URL}/api/v1/search/image`, {
    multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a jpeg") } },
  });

  expect(response.status()).toBe(422);
  expect((await response.json()).type).toBe("urn:angel:problem:invalid-image");
});
