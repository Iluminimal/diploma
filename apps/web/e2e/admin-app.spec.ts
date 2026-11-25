import { test, expect } from "./fixtures";

// Admin-ыг жинхэнэ апп болгож буй хэсгүүд: глобал хайлт (⌘K), мөр сонгоод олон бараа нэг дор хасах.

test("⌘K finds a product by name and opens it", async ({ adminPage: page, newProduct }) => {
  const product = await newProduct({ name: `Palette jacket ${Date.now()}` });
  await page.goto("/admin");

  const dialog = page.getByRole("dialog", { name: "Search the admin" });
  // Хуудас hydrate хийгдэх хүртэл товчлол ажиллахгүй: нээгдтэл дахин оролдоно.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("ControlOrMeta+k");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByRole("combobox").fill(product.name);
  await dialog.getByRole("option", { name: new RegExp(product.name) }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/products/${product.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
});

test("the search box in the top bar opens the same search, and / does too", async ({ adminPage: page }) => {
  await page.goto("/admin");

  const dialog = page.getByRole("dialog", { name: "Search the admin" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.getByRole("button", { name: "Search" }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("/");
  await expect(dialog).toBeVisible();
});

test("a warehouse worker withdraws several products at once from the selection bar, and restores them the same way", async ({ warehousePage: page, newProduct }) => {
  const tag = `Bulk ${Date.now()}`;
  const first = await newProduct({ name: `${tag} one` });
  const second = await newProduct({ name: `${tag} two` });
  await page.goto(`/admin/products?q=${encodeURIComponent(tag)}`);

  await page.getByRole("checkbox", { name: `Select ${first.name}` }).check();
  await page.getByRole("checkbox", { name: `Select ${second.name}` }).check();
  const bar = page.getByRole("region", { name: "2 selected" });
  await bar.getByRole("button", { name: "Withdraw" }).click();
  await page.getByRole("dialog", { name: "Withdraw 2 products?" }).getByRole("button", { name: "Withdraw" }).click();

  const table = page.getByRole("table", { name: "Products" });
  await expect(table.getByRole("row", { name: new RegExp(first.name) })).toContainText("Withdrawn");
  await expect(table.getByRole("row", { name: new RegExp(second.name) })).toContainText("Withdrawn");
  await expect(page.getByRole("region", { name: /selected/ })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Select all on this page" }).check();
  await page.getByRole("region", { name: "2 selected" }).getByRole("button", { name: "Restore" }).click();
  await expect(table.getByRole("row", { name: new RegExp(first.name) })).toContainText("On sale");
});

test("on a phone the products come as cards, not a sideways-scrolling table", async ({ warehousePage: page, newProduct }) => {
  const product = await newProduct({ name: `Phone card ${Date.now()}` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/products?q=${encodeURIComponent(product.name)}`);

  await expect(page.getByRole("table")).toHaveCount(0);
  const card = page.getByRole("list", { name: "Products" }).getByRole("listitem").filter({ hasText: product.name });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: `Edit ${product.name}` })).toBeVisible();
  // Хуудас хажуу тийш гүйлгэгдэхгүй.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
