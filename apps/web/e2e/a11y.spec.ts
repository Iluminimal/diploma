import { test, expect } from "./fixtures";
import { addToCart, placePaidOrder, productPhoto, saveToWishlist } from "./support/api";
import { SCHEMES, VARIANTS, VIEWPORTS, expectNoViolations, scan, settled, sweep, type Variant } from "./support/axe";

/**
 * Automated WCAG 2.1 A/AA checks (axe) on every kind of screen, in light and dark mode at phone
 * and desktop width, with reduced motion so nothing is caught mid-animation. Automated checks find
 * roughly a third of accessibility problems: keyboard use and screen reader wording are covered
 * by the specs in keyboard.spec.ts and by the manual pass described in docs/frontend.md.
 */

const heading = (page: import("@playwright/test").Page) => async () => {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
};

test.describe("storefront", () => {
  test("home", async ({ page }) => {
    await sweep(page, "/", { ready: heading(page) });
  });

  test("listing, plain and filtered", async ({ page }) => {
    await sweep(page, "/products", { ready: heading(page) });
    await sweep(page, "/products?gender=Women&sort=price_asc", { ready: heading(page) });
  });

  test("an empty listing", async ({ page }) => {
    await sweep(page, "/products?q=zzzzzzzz", { ready: heading(page) });
  });

  test("product page", async ({ page, products }) => {
    const [product] = products;
    await sweep(page, `/products/${product!.id}/${product!.slug}`, { ready: heading(page) });
  });

  test("search by photo, empty", async ({ page }) => {
    await sweep(page, "/search", { ready: heading(page) });
  });

  test("search by photo, with results", async ({ page, api, products }) => {
    const photo = await productPhoto(api, products[0]!);
    const found = [];
    for (const variant of VARIANTS) {
      await page.setViewportSize(VIEWPORTS[variant.viewport]);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      await page.goto("/search");
      await page.locator('input[aria-label="Choose a photo"]').setInputFiles({
        name: "photo.webp",
        mimeType: "image/webp",
        buffer: photo,
      });
      await expect(page.getByRole("region", { name: "Results" }).getByRole("link").first()).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}`)));
    }
    expectNoViolations(found, "/search with results");
  });

  test("sign in and register", async ({ page }) => {
    await sweep(page, "/login", { ready: heading(page) });
    await sweep(page, "/register", { ready: heading(page) });
  });

  test("an empty cart", async ({ page }) => {
    await sweep(page, "/cart", { ready: heading(page) });
  });

  test("a page that does not exist", async ({ page }) => {
    await sweep(page, "/no-such-page", { ready: heading(page) });
  });

  test("the mini-cart drawer", async ({ page, products }) => {
    const [product] = products;
    const found = [];
    for (const variant of VARIANTS) {
      await page.setViewportSize(VIEWPORTS[variant.viewport]);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      await page.context().clearCookies(); // a fresh guest cart: this product has little stock
      await page.goto(`/products/${product!.id}/${product!.slug}`);
      await page.locator("label", { hasText: /^M$/ }).click();
      await page.getByRole("button", { name: /add to cart/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}`)));
    }
    expectNoViolations(found, "the mini-cart");
  });

  test("the header search suggestions", async ({ page }) => {
    const found = [];
    for (const variant of VARIANTS) {
      await page.setViewportSize(VIEWPORTS[variant.viewport]);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.getByRole("combobox").first().fill("shirt");
      await expect(page.getByRole("listbox")).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}`)));
    }
    expectNoViolations(found, "the search suggestions");
  });

  test("the filters sheet on a phone", async ({ page }) => {
    const found = [];
    const phone: Variant[] = SCHEMES.map((scheme) => ({ viewport: "phone", scheme }));
    for (const variant of phone) {
      await page.setViewportSize(VIEWPORTS.phone);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      await page.goto("/products");
      await page.getByRole("button", { name: /filters/i }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `phone/${variant.scheme}`)));
    }
    expectNoViolations(found, "the filters sheet");
  });
});

test.describe("signed in", () => {
  test("account, checkout and order pages", async ({ shopperPage: page, api, account, products }) => {
    const [first, second, third] = products;
    const number = await placePaidOrder(api, account, first!.id);
    await saveToWishlist(api, account, second!.id);
    await addToCart(api, account, third!.id);

    await sweep(page, "/account/orders", { ready: heading(page) });
    await sweep(page, `/account/orders/${number}`, { ready: () => expect(page.getByText("Payment summary")).toBeVisible() });
    await sweep(page, "/account/addresses", { ready: () => expect(page.getByText("12 Analytical Way")).toBeVisible() });
    await sweep(page, "/account/wishlist", { ready: heading(page) });
    await sweep(page, "/checkout", { ready: () => expect(page.getByRole("button", { name: /pay now/i })).toBeVisible() });
    await sweep(page, `/checkout/confirmation/${number}`, { ready: heading(page) });
  });
});

test.describe("admin", () => {
  test("products and orders", async ({ adminPage: page, api, account, products }) => {
    const [product] = products;
    const number = await placePaidOrder(api, account, product!.id);
    const ready = (text: string | RegExp) => () => expect(page.getByText(text).first()).toBeVisible();

    await sweep(page, "/admin/products", { ready: () => expect(page.getByRole("table", { name: "Products" })).toBeVisible() });
    await sweep(page, "/admin/products/new", { ready: () => expect(page.getByLabel("Photo", { exact: true })).toBeVisible() });
    await sweep(page, `/admin/products/${product!.id}`, { ready: () => expect(page.getByLabel("Name")).toBeVisible() });
    await sweep(page, "/admin/orders", { ready: () => expect(page.getByRole("table", { name: /Orders/ })).toBeVisible() });
    await sweep(page, `/admin/orders/${number}`, { ready: ready("Customer and payment") });
  });
});
