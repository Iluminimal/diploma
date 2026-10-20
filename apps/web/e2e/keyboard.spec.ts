import { test, expect } from "./fixtures";
import { openSearch } from "./support/ui";

/**
 * Keyboard болон screen reader хэрэглэгчид хэрэгтэй боловч axe шүүж чаддаггүй зүйл: focus очих
 * ёстой газартаа очих, байх ёстой газартаа үлдэх, үргэлж харагдах.
 */

test("the skip link is the first stop and moves focus into the page", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  await page.keyboard.press("Enter");

  await expect(page.locator("main")).toBeFocused();
});

test("every stop in the header and the first screen of a page shows where focus is", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const invisible: string[] = [];
  for (let stop = 0; stop < 25; stop += 1) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const shadow = style.boxShadow !== "none";
      // Radio эсвэл checkbox focus-ыг харагдах дүр төрх дээрээ (дараагийн элемент) үзүүлнэ.
      const label = `${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? ""}`;
      return { label, shown: outline || shadow, hidden: el.className.includes?.("sr-only") ?? false };
    });
    if (state && !state.shown && !state.hidden) invisible.push(state.label);
  }
  expect(invisible, `focused with nothing to show it: ${invisible.join(", ")}`).toEqual([]);
});

test("the search box works from the keyboard", async ({ page }) => {
  await page.goto("/");
  const box = await openSearch(page);
  await box.fill("shirt");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(box).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/(products\?.*q=shirt|c\/|products\/)/);
});

test("Escape closes the search panel and gives focus back to the magnifier", async ({ page }) => {
  await page.goto("/");
  await openSearch(page);
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeFocused();
});

test("pressing / opens the search panel with the cursor in the field, and Escape closes it", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("/");

  const box = page.getByRole("combobox");
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
});

test("a slash typed in a form field is just a slash", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email or phone number");
  await email.focus();

  await page.keyboard.type("a/b");

  await expect(email).toHaveValue("a/b");
  await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
});

test("the arrow keys move along the navigation bar and switch an open flyout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const links = nav.getByRole("link");
  await expect(nav.getByRole("link").first()).toHaveAttribute("aria-expanded", "false", { timeout: 15_000 });

  await links.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(links.first()).toHaveAttribute("aria-expanded", "true");
  await links.first().focus();

  await page.keyboard.press("ArrowRight");

  await expect(links.nth(1)).toBeFocused();
  await expect(links.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(links.first()).toHaveAttribute("aria-expanded", "false");
});

test("the mini-cart keeps focus inside, closes with Escape and gives focus back", async ({ page, products }) => {
  const [product] = products;
  await page.goto(`/products/${product!.id}/${product!.slug}`);
  await page.locator("fieldset label").first().click();
  await page.getByRole("button", { name: /add to bag/i }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");

  await expect(drawer).toBeHidden();
  // Dialog сан panel-ийг unmount хийснээс нэг tick хойш focus-ыг буцааж өгдөг.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName.toLowerCase())).not.toBe("body");
});

test("category filters expand and collapse with the keyboard and announce their state", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/products");
  const toggle = page.getByRole("button", { name: /subcategories$/ }).first();
  const label = (await toggle.getAttribute("aria-label")) ?? "";
  const wasOpen = (await toggle.getAttribute("aria-expanded")) === "true";

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", String(!wasOpen));
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", String(wasOpen));
  expect(label).toMatch(/^(Show|Hide) /);

  await page.getByRole("checkbox").first().focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/products\?/);
});

test("a form says what is wrong and moves nothing out of reach", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue" }).click();

  const email = page.getByLabel("Email or phone number");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").first()).toBeVisible();
  const describedBy = await email.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(/\S/);
});

test("reduced motion switches animations off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const longest = await page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      for (const value of [style.transitionDuration, style.animationDuration]) {
        for (const part of value.split(",")) {
          const seconds = part.trim().endsWith("ms") ? parseFloat(part) / 1000 : parseFloat(part);
          if (!Number.isNaN(seconds)) max = Math.max(max, seconds);
        }
      }
    }
    return max;
  });
  expect(longest).toBeLessThanOrEqual(0.011);
});
