import { test, expect } from "./fixtures";
import { pickCategory } from "./support/catalog";
import { API_URL } from "./support/env";
import { openSearch } from "./support/ui";
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

test("the department menu behaves like one flyout: instant switching, a solid bar, closing on New or leaving", async ({
  page,
  api,
}) => {
  const { departments } = await (await api.get(`${API_URL}/api/v1/catalog/nav`)).json();
  const [first, second] = departments as { slug: string; name: string }[];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const link = (name: string) => mainNav(page).getByRole("link", { name, exact: true });
  const flyout = page.locator(".mega-flyout");
  const barBackground = () => page.getByRole("banner").evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(link(first!.name)).toHaveAttribute("aria-expanded", "false", { timeout: 15_000 });
  const translucent = await barBackground();

  await link(first!.name).hover();
  await expect(flyout).toHaveAttribute("data-open", "true");
  await expect(page.getByRole("region", { name: `${first!.name} categories`, exact: true })).toBeVisible();
  await expect.poll(barBackground).not.toBe(translucent);

  // To another department: no close and reopen, the one flyout just shows the other content.
  await link(second!.name).hover();
  await expect(link(second!.name)).toHaveAttribute("aria-expanded", "true");
  await expect(link(first!.name)).toHaveAttribute("aria-expanded", "false");
  await expect(flyout).toHaveAttribute("data-open", "true");
  await expect(page.getByRole("region", { name: `${second!.name} categories`, exact: true })).toBeVisible();

  await link("New").hover();
  await expect(flyout).toHaveAttribute("data-open", "false");

  await link(first!.name).hover();
  await expect(flyout).toHaveAttribute("data-open", "true");
  await page.mouse.move(720, 880);
  await expect(flyout).toHaveAttribute("data-open", "false");
  await expect.poll(barBackground).toBe(translucent);
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

  await openSearch(page);
  await page.getByRole("search").getByRole("button", { name: "Search by photo" }).click();
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
  const box = await openSearch(page);

  await box.fill(sub.name.slice(0, 4));
  await expect(page.getByRole("option").filter({ hasText: sub.name }).first()).toBeVisible();

  await box.fill("blue shirt");
  await box.press("Enter");
  await expect(page).toHaveURL(/q=blue%20shirt/);
  await page.goto("/");
  await openSearch(page);
  await expect(page.getByRole("option", { name: "blue shirt" })).toBeVisible();
});

test.describe("on a computer the bar stays, whatever is opened (apple.com's global nav)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const bar = (page: import("@playwright/test").Page) => page.getByRole("banner");
  const BAR_HEIGHT = 45; // 2.75rem and its hairline

  async function expectBarWhole(page: import("@playwright/test").Page) {
    await expect(bar(page).getByRole("link", { name: "Angel" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Women", exact: true })).toBeVisible();
    await expect(bar(page).getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(bar(page).getByRole("button", { name: /^Bag/ })).toBeVisible();
  }

  test("the search is as tall as its content under the bar, the page below is veiled, and the bar is still there", async ({ page }) => {
    await page.goto("/");

    await bar(page).getByRole("button", { name: "Search", exact: true }).click();

    const panel = page.getByRole("dialog", { name: "Search" });
    await expect(panel).toBeVisible();
    await expectBarWhole(page);
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeGreaterThan(200);
    const box = await panel.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(BAR_HEIGHT - 1);
    expect(box!.height).toBeLessThan(600); // not the whole screen: the page shows below it, under the curtain
    expect(box!.width).toBeGreaterThanOrEqual(1439);
    const curtain = page.locator(".bar-curtain");
    await expect(curtain).toHaveCSS("opacity", "1");
    expect(await curtain.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain("blur(20px)");

    // Pressing the curtain closes the flyout.
    await page.mouse.click(720, 850);
    await expect(panel).toBeHidden();
    await expect(curtain).toHaveCSS("opacity", "0");
  });

  test("the links, the logo and the icons are spread evenly across the bar", async ({ page }) => {
    await page.goto("/");
    await expect(mainNav(page).getByRole("link", { name: "Women", exact: true })).toBeVisible();

    const lefts = await bar(page).evaluate((header) => {
      const items = [...header.querySelectorAll<HTMLElement>("a, button")].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().top < 50 && !e.closest(".mega-flyout"));
      return items.map((e) => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right }));
    });
    const gaps = lefts.slice(1).map((item, i) => item.left - lefts[i]!.right);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(40); // about the same gap everywhere
  });

  test("the Bag opens under the bar too, and the bag button closes it again", async ({ page }) => {
    await page.goto("/");
    const bag = bar(page).getByRole("button", { name: /^Bag/ });

    await bag.click();
    await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
    await expectBarWhole(page);

    await bag.click();
    await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeHidden();
  });

  test("one flyout at a time: the search, the Bag and a department replace each other", async ({ page }) => {
    await page.goto("/");
    const search = bar(page).getByRole("button", { name: "Search", exact: true });
    const bag = bar(page).getByRole("button", { name: /^Bag/ });

    await search.click();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
    await bag.click();
    await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();

    await mainNav(page).getByRole("link", { name: "Women", exact: true }).hover();
    await expect(mainNav(page).getByRole("link", { name: "Women", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeHidden();

    await search.click();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Women", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expectBarWhole(page);
  });
});
