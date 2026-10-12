import { test, expect } from "./fixtures";
import { pickCategory } from "./support/catalog";
import { openSearch } from "./support/ui";
import {
  addToCart,
  adminSession,
  placePaidOrder,
  postReview,
  productPhoto,
  saveToWishlist,
  shipAndDeliver,
  userId,
} from "./support/api";
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

  test("department and category pages", async ({ page, api }) => {
    const { department, sub } = await pickCategory(api);
    await sweep(page, `/c/${department.slug}`, { ready: heading(page) });
    await sweep(page, `/c/${department.slug}/${sub.path}`, { ready: heading(page) });
  });

  test("the open department menu and the photo-search dialog", async ({ page, api }) => {
    const { department } = await pickCategory(api);
    const found = [];
    for (const variant of VARIANTS.filter((v) => v.viewport === "desktop")) {
      await page.setViewportSize(VIEWPORTS[variant.viewport]);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      await page.goto("/");
      const trigger = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: department.name, exact: true });
      await expect(async () => {
        await trigger.hover();
        await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
      }).toPass();
      await expect(page.getByRole("region", { name: `${department.name} categories` })).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `menu/${variant.scheme}`)));

      await page.mouse.move(700, 600);
      await openSearch(page);
      await page.getByRole("search").getByRole("button", { name: "Search by photo" }).click();
      await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `photo-dialog/${variant.scheme}`)));
    }
    expectNoViolations(found, "department menu and photo dialog");
  });

  test("the profile page and its dialogs", async ({ shopperPage: page }) => {
    const found = [];
    for (const variant of VARIANTS) {
      await page.setViewportSize(VIEWPORTS[variant.viewport]);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      await page.goto("/account/profile");
      await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}/page`)));

      await page.getByRole("button", { name: /Change password/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}/password`)));
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /Delete my account/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}/delete`)));
      await page.keyboard.press("Escape");
    }
    expectNoViolations(found, "/account/profile");
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
    await sweep(page, "/login?method=email", { ready: heading(page) });
    await sweep(page, "/forgot-password", { ready: heading(page) });
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
      await page.locator("fieldset label").first().click();
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
      const box = await openSearch(page);
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}/quick-links`)));
      await box.fill("shirt");
      await expect(page.getByRole("listbox")).toBeVisible();
      await settled(page);
      found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}/suggestions`)));
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

test.describe("reviews and tracking", () => {
  test("a delivered order, and a product with reviews as a visitor and as the buyer", async ({ newProduct,
    shopperPage: page,
    browser,
    api,
    account,
  }) => {
    test.setTimeout(240_000);
    const admin = await adminSession(api);
    const product = await newProduct();
    const number = await placePaidOrder(api, account, product.id);
    await shipAndDeliver(api, admin, number);

    // The buyer, with the form to write a review, and with their own review afterwards.
    const reviewsReady = () => expect(page.getByRole("form", { name: "Write a review" })).toBeVisible();
    await sweep(page, `/account/orders/${number}`, { ready: () => expect(page.getByRole("link", { name: /Write a review/ })).toBeVisible() });
    await sweep(page, `/products/${product.id}`, { ready: reviewsReady });
    await postReview(api, account, product.id, { rating: 4, title: "Fits well", body: "Soft cotton and true to size." });
    await sweep(page, `/products/${product.id}`, {
      ready: () => expect(page.getByRole("button", { name: "Edit" })).toBeVisible(),
    });

    // A visitor sees the reviews and the invitation to sign in.
    const visitor = await (await browser.newContext()).newPage();
    await sweep(visitor, `/products/${product.id}`, {
      ready: () => expect(visitor.getByRole("heading", { name: "Fits well" })).toBeVisible(),
    });
    await sweep(visitor, `/products?q=${encodeURIComponent(product.name)}`, {
      ready: () => expect(visitor.getByRole("img", { name: "4 out of 5 stars" }).first()).toBeVisible(),
    });
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
  test("dashboard, inventory, customers and reviews", async ({ newProduct, adminPage: page, api, account }) => {
    test.setTimeout(240_000);
    const admin = await adminSession(api);
    const product = await newProduct({ stock: 3 });
    const number = await placePaidOrder(api, account, product.id);
    await shipAndDeliver(api, admin, number);
    await postReview(api, account, product.id, { rating: 5, title: "Lovely", body: "Would buy again." });
    const customer = await userId(api, account);

    await sweep(page, "/admin", { ready: () => expect(page.getByRole("img", { name: /Daily revenue/ })).toBeVisible() });
    await sweep(page, "/admin?days=7", { ready: () => expect(page.getByRole("img", { name: /Daily revenue/ })).toBeVisible() });
    await sweep(page, "/admin/orders?status=delivered", { ready: () => expect(page.getByRole("table", { name: /Orders/ })).toBeVisible() });
    await sweep(page, `/admin/orders/${number}`, { ready: () => expect(page.getByRole("region", { name: "History" })).toBeVisible() });
    await sweep(page, `/admin/inventory?q=${encodeURIComponent(product.name)}`, {
      ready: () => expect(page.getByRole("table", { name: /Products on sale/ })).toBeVisible(),
    });
    await sweep(page, "/admin/customers", { ready: () => expect(page.getByRole("table", { name: "Customers" })).toBeVisible() });
    await sweep(page, `/admin/customers/${customer}`, { ready: () => expect(page.getByRole("region", { name: "Recent orders" })).toBeVisible() });
    await sweep(page, "/admin/reviews", { ready: () => expect(page.getByRole("list", { name: "Reviews, newest first" })).toBeVisible() });
  });

  test("the fulfilment dialogs", async ({ newProduct, adminPage: page, api, account }) => {
    const product = await newProduct();
    const number = await placePaidOrder(api, account, product.id);
    const found = [];
    for (const variant of VARIANTS) {
      await page.setViewportSize(VIEWPORTS[variant.viewport]);
      await page.emulateMedia({ colorScheme: variant.scheme, reducedMotion: "reduce" });
      for (const [button, dialogName] of [
        ["Mark as shipped", "Mark as shipped"],
        ["Refund", "Refund this order?"],
      ] as const) {
        await page.goto(`/admin/orders/${number}`);
        await page.getByRole("button", { name: button, exact: true }).click();
        await expect(page.getByRole("dialog", { name: dialogName })).toBeVisible();
        // Errors are part of what a screen reader must be able to reach.
        await page.getByRole("dialog").getByRole("button", { name: /Mark as shipped|Refund order/ }).click();
        await expect(page.getByRole("dialog").getByRole("alert").first()).toBeVisible();
        await settled(page);
        found.push(...(await scan(page, `${variant.viewport}/${variant.scheme}/${dialogName}`)));
      }
    }
    expectNoViolations(found, "the fulfilment dialogs");
  });
});
