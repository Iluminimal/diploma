import { test, expect } from "./fixtures";

test("the first tile is a headline with two ways in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Shop by photo." })).toBeVisible();
  await page.getByRole("link", { name: "Shop new arrivals", exact: true }).click();
  await expect(page).toHaveURL(/\/products\?sort=newest$/);
});

test("the photo button in the hero opens the photo picker", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("main").getByRole("button", { name: "Search with a photo" }).click();

  await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
});

test("below it: the departments, the photo search, the new arrivals and what delivery is like", async ({ page }) => {
  await page.goto("/");

  for (const [name, href] of [["Women", "/c/women"], ["Men", "/c/men"], ["Kids", "/c/kids"]] as const) {
    await expect(page.getByRole("region", { name, exact: true }).getByRole("link", { name: `Shop ${name.toLowerCase()}` })).toHaveAttribute("href", href);
  }
  const photo = page.getByRole("region", { name: "Search with a photo" });
  await expect(photo.getByRole("heading", { name: "From a photo to your Bag." })).toBeAttached();
  await photo.getByRole("button", { name: "Try it" }).click();
  await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "New arrivals" }).getByRole("link").first()).toHaveAttribute("href", /^\/(products|c)/);
  await expect(page.getByRole("region", { name: "Delivery and payment" }).getByRole("heading")).toHaveText(["Free delivery", "Express delivery", "Secure checkout"]);
});

test("the tiles run edge to edge, 12px apart, and nothing else is on the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const boxes = await page.locator("main section").evaluateAll((sections) =>
    sections.slice(0, 3).map((s) => {
      const r = s.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top + scrollY), height: Math.round(r.height) };
    }),
  );
  expect(boxes[0]).toMatchObject({ left: 0, width: 1440 });
  expect(boxes[0]!.height).toBeGreaterThanOrEqual(680);
  // Дараагийн tile эхнийхээсээ 12px доор эхэлнэ.
  expect(boxes[1]!.top - (boxes[0]!.top + boxes[0]!.height)).toBe(12);
  await expect(page.getByRole("heading", { name: /From a photo to your Bag/ })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Shop by category" })).toHaveCount(0);
});

test("recently viewed appears after looking at a product", async ({ page, products }) => {
  const product = products[0]!;
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Recently viewed" })).toHaveCount(0);

  await page.goto(`/products/${product.id}/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
  await page.goto("/");

  const shelf = page.getByRole("region", { name: "Recently viewed" });
  await expect(shelf.getByRole("link", { name: new RegExp(product.name) }).first()).toBeVisible();
});
