import { test, expect } from "./fixtures";

test("the first tile is a headline with two ways in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Shop by photo." })).toBeVisible();
  await page.getByRole("link", { name: "New arrivals", exact: true }).first().click();
  await expect(page).toHaveURL(/\/products\?sort=newest$/);
});

test("the photo button in the hero opens the photo picker", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("main").getByRole("button", { name: "Search with a photo" }).click();

  await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
});

test("below it: the departments, the photo search and the new arrivals", async ({ page }) => {
  await page.goto("/");

  for (const [name, href] of [["Women", "/c/women"], ["Men", "/c/men"], ["Kids", "/c/kids"]] as const) {
    await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  const photo = page.getByRole("region", { name: "Search with a photo" });
  await expect(photo.getByRole("heading", { name: "From photo to Bag." })).toBeAttached();
  await photo.getByRole("button", { name: "Try it" }).click();
  await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "New arrivals" }).getByRole("link").first()).toHaveAttribute("href", /^\/(products|c)/);
});

test("the page is light by default (GitHub light) and dark once Dark is picked, and the departments are three equal cards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator(".gh")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("region", { name: "Popular" })).toBeAttached();
  const cards = await page.getByRole("main").locator("a.gh-card").evaluateAll((links) =>
    links.slice(0, 3).map((a) => Math.round(a.getBoundingClientRect().width)),
  );
  expect(cards).toHaveLength(3);
  expect(new Set(cards).size).toBe(1);
  await expect(page.getByRole("heading", { name: /From photo to Bag/ })).toHaveCount(1);

  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.reload();
  await expect(page.locator(".gh")).toHaveCSS("background-color", "rgb(13, 17, 23)");
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

test("the hero opens word by word without ever hiding its headline, and the photo-search story is a pinned scroll on a wide screen", async ({ page }) => {
  await page.goto("/");

  const heading = page.getByRole("heading", { level: 1, name: "Shop by photo." });
  await expect(heading).toBeVisible();
  await expect(heading.locator(".word")).toHaveCount(3);
  const story = page.locator(".story");
  expect(await story.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(1500);
  await story.scrollIntoViewIfNeeded();
  await expect(page.getByRole("region", { name: "Search with a photo" }).getByRole("listitem")).toHaveCount(3);
});

test("with reduced motion nothing moves and the story is not pinned", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");

  expect(await page.locator(".word").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator(".story").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(1000);
  await context.close();
});

test("a product card tilts towards the pointer and lets go when it leaves", async ({ page }) => {
  await page.goto("/products");

  const card = page.locator("[data-tilt]").first();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2, { steps: 4 });
  await expect(card).toHaveAttribute("data-tilting", "");
  await page.mouse.move(2, 2, { steps: 4 });
  await expect(card).not.toHaveAttribute("data-tilting", "");
});
