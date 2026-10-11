import { test, expect } from "./fixtures";
import { pickCategory } from "./support/catalog";
import { productPhoto } from "./support/api";

const mainNav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main" });

test("the department menu opens on hover and leads to a category page with a breadcrumb and counts", async ({
  page,
  api,
}) => {
  const { department, group, sub } = await pickCategory(api);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const trigger = mainNav(page).getByRole("link", { name: department.name, exact: true });
  await trigger.hover();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: `${department.name} categories` });
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: sub.name, exact: true }).first().click();

  await expect(page).toHaveURL(new RegExp(`/c/${department.slug}/${sub.path}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(sub.name);
  const crumbs = page.getByRole("navigation", { name: "breadcrumb" });
  await expect(crumbs).toContainText(department.name);
  await expect(crumbs).toContainText(group.name);
  await expect(page.getByText(`${sub.product_count.toLocaleString("en-US")} product`)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});

test("the sidebar drills down with counts and every step is a link", async ({ page, api }) => {
  const { department, group, sub } = await pickCategory(api);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/c/${department.slug}`);

  const tree = page.getByRole("navigation", { name: "Categories" });
  await expect(tree.getByRole("link", { name: `All ${department.name}` })).toHaveAttribute("aria-current", "page");
  await tree.getByRole("link", { name: new RegExp(`^${group.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${department.slug}/${group.path}$`));
  await tree.getByRole("link", { name: new RegExp(`^${sub.name}`) }).click();

  await expect(page).toHaveURL(new RegExp(`/c/${department.slug}/${sub.path}$`));
  await expect(tree.getByRole("link", { name: sub.name, exact: false }).first()).toBeVisible();
  await expect(tree.getByRole("link", { name: `All ${department.name}` })).not.toHaveAttribute("aria-current", "page");
});

test("the department menu works from the keyboard", async ({ page, api }) => {
  const { department } = await pickCategory(api);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const trigger = mainNav(page).getByRole("link", { name: department.name, exact: true });
  // Wait for the menu data: the panel only opens once there is something to show.
  await expect(async () => {
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
  }).toPass();

  const panel = page.getByRole("region", { name: `${department.name} categories` });
  await expect(panel.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("on a phone the menu drills from a department to a category", async ({ page, api }) => {
  const { department, group, sub } = await pickCategory(api);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog");
  await menu.getByRole("button", { name: department.name, exact: true }).click();
  await expect(menu.getByRole("link", { name: `Shop all ${department.name}` })).toBeVisible();
  await menu.getByRole("button", { name: group.name, exact: true }).click();
  // A sub-category has article types below it: it is a step down, with "Shop all" at its top.
  await menu.getByRole("button", { name: sub.name, exact: true }).click();
  await menu.getByRole("link", { name: `Shop all ${sub.name}` }).click();

  await expect(page).toHaveURL(new RegExp(`/c/${department.slug}/${sub.path}$`));
  await expect(menu).toBeHidden();
});

test("a category that does not exist is a 404", async ({ page }) => {
  const response = await page.goto("/c/men/apparel/no-such-thing");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the camera button inside the search bar opens a photo search", async ({ page, api, products }) => {
  const photo = await productPhoto(api, products[0]!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const search = page.getByRole("search");
  await search.getByRole("button", { name: "Search by photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Search by photo" });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[aria-label="Choose a photo"]').setInputFiles({
    name: "photo.webp",
    mimeType: "image/webp",
    buffer: photo,
  });

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("status").filter({ hasText: /similar item/ })).toBeVisible();
});

test("the search box suggests categories and remembers searches", async ({ page, api }) => {
  const { sub } = await pickCategory(api);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const box = page.getByRole("combobox").first();

  await box.fill(sub.name.slice(0, 4));
  await expect(page.getByRole("option").filter({ hasText: sub.name }).first()).toBeVisible();

  await box.fill("blue shirt");
  await box.press("Enter");
  await expect(page).toHaveURL(/q=blue%20shirt/);
  await page.goto("/");
  await box.focus();
  await expect(page.getByRole("option", { name: "blue shirt" })).toBeVisible();
});
