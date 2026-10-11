import { test, expect } from "./fixtures";

test("the first screen is a headline with three ways in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Shop by photo." })).toBeVisible();
  await page.getByRole("link", { name: "Shop women", exact: true }).click();
  await expect(page).toHaveURL(/\/c\/women$/);
});

test("the photo button in the hero opens the photo picker", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("main").getByRole("button", { name: "Search with a photo" }).click();

  await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
});

test("below the hero: the story, departments, category pills and shelves", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 2, name: /From a photo to your cart/ })).toBeAttached();
  const departments = page.getByRole("region", { name: "Departments" });
  await expect(departments.getByRole("link")).toHaveCount(3);
  await expect(departments.getByRole("link", { name: /Women/ })).toHaveAttribute("href", "/c/women");
  const pills = page.getByRole("region", { name: "Shop by category" });
  await expect(pills.getByRole("link").first()).toHaveAttribute("href", /^\/c\//);
  await expect(page.getByRole("region", { name: "New arrivals" })).toBeAttached();
  await expect(page.getByRole("list", { name: "Matching products" }).getByRole("link").first()).toHaveAttribute("href", /^\/products\//);
  await expect(page.getByText("Free shipping over $100")).toBeAttached();
});

test("the story stays on screen while you scroll through it, and reads as a list when motion is reduced", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto("/");
  const geometry = () =>
    page.evaluate(() => {
      const track = document.querySelector(".story-track")!.getBoundingClientRect();
      const stage = document.querySelector(".story-stage")!;
      return { trackHeight: track.height, viewport: innerHeight, position: getComputedStyle(stage).position, stageTop: stage.getBoundingClientRect().top };
    });

  const start = await geometry();
  expect(start.position).toBe("sticky");
  expect(start.trackHeight).toBeGreaterThan(start.viewport * 3);
  await page.evaluate(() => {
    const track = document.querySelector(".story-track")!;
    window.scrollTo(0, track.getBoundingClientRect().top + scrollY + track.getBoundingClientRect().height * 0.5);
  });
  await page.waitForTimeout(300);
  expect((await geometry()).stageTop).toBeCloseTo(0, 0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const reduced = await geometry();
  expect(reduced.position).toBe("static");
  expect(reduced.trackHeight).toBeLessThan(reduced.viewport * 2);
  await expect(page.getByRole("heading", { level: 3, name: "Find it" })).toBeVisible();
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
