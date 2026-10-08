import { test, expect } from "./fixtures";
import { productPhoto, type CatalogProduct } from "./support/api";
import { API_URL, FAKE_MODEL } from "./support/env";
import { recordSearches } from "./support/recorder";
import type { APIRequestContext, Page } from "@playwright/test";

const results = (page: Page) => page.getByRole("status").filter({ hasText: /similar item/ });
const photoInput = (page: Page) => page.locator('input[aria-label="Choose a photo"]');
const upload = (photo: Buffer) => ({ name: "photo.webp", mimeType: "image/webp", buffer: photo });

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
  await expect(page.getByRole("button", { name: /Detected:/ })).toBeVisible();
  if (!FAKE_MODEL) {
    // FashionCLIP sees through the browser's re-encoding: the product's own photo still wins.
    await expect(page.locator("article a").first()).toHaveAttribute("href", new RegExp(`^/products/${product.id}/`));
  }
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
  // The thumbnail is a lossy copy of the photo the embedding was made from: very close, not exact.
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
  await searches.clear();

  await page.getByRole("button", { name: /Detected:/ }).click();
  // "Any category" comes first; the next entry is the most likely category the model found.
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
  await page.waitForLoadState("networkidle"); // the listener is attached by React

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
  expect((await response.json()).type).toBe("urn:lookalike:problem:invalid-image");
});
