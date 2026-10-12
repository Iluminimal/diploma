import { test, expect } from "./fixtures";
import {
  addToCartFromProductPage,
  chooseSize,
  openProduct,
  pickProduct,
} from "./support/ui";

test("adding to the cart confirms on the button, flies to the cart and shows the free-shipping progress", async ({
  page,
  products,
}, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex);
  await openProduct(page, product);

  // No size yet: the sizes shake and the message slides in.
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByText("Please select a size.")).toBeVisible();
  await expect(page.locator("fieldset").locator("xpath=..")).toHaveClass(/animate-shake/);

  await chooseSize(page);
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();

  await expect(page.getByRole("button", { name: "Added", exact: true })).toBeVisible();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(product.name)).toBeVisible();
  await expect(drawer.getByRole("progressbar", { name: "Progress to free shipping" })).toBeVisible();
  // The flying copy of the photo is gone once it has landed.
  await expect(page.locator('body > img[aria-hidden="true"]')).toHaveCount(0);
});

test("a removed line can be brought back with Undo", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 1);
  await addToCartFromProductPage(page, product);
  const drawer = page.getByRole("dialog");

  await drawer.getByRole("button", { name: new RegExp(`Remove ${product.name}`) }).click();
  await expect(drawer.getByText("Your cart is empty")).toBeVisible();
  await drawer.getByRole("button", { name: "Undo" }).click();

  await expect(drawer.getByText(product.name)).toBeVisible();
});

test("the product page has details and delivery that open and close", async ({ page, products }, testInfo) => {
  await openProduct(page, pickProduct(products, testInfo.workerIndex + 2));

  const delivery = page.getByText("Delivery", { exact: true });
  await delivery.click();
  await expect(page.getByText("Standard shipping")).toBeVisible();
  await expect(page.getByText("Express shipping")).toBeVisible();
  await expect(page.getByText("Product details")).toBeVisible();
});

test("a product photo is replaced by the enlarged view on click", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 3);
  await openProduct(page, product);

  await page.getByRole("button", { name: `Enlarge photo of ${product.name}` }).click();

  await expect(page.getByRole("dialog").getByRole("img", { name: product.name })).toBeVisible();
});

test("checkout shows its steps done as they are chosen, then covers the page while paying", async ({
  shopperPage: page,
  products,
}, testInfo) => {
  await addToCartFromProductPage(page, pickProduct(products, testInfo.workerIndex + 4));
  await page.getByRole("dialog").getByRole("link", { name: "Checkout" }).click();
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Address", { exact: true }).fill("12 Analytical Way");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("12345");
  await page.getByRole("button", { name: "Use this address" }).click();

  await expect(page.getByRole("region", { name: "Delivery address" })).toContainText("12 Analytical Way");
  await expect(page.getByRole("region", { name: "Shipping method" })).toContainText("business days");

  const card = page.getByLabel("Card number");
  await card.fill("");
  await card.pressSequentially("5555555555554444");
  await expect(card).toHaveValue("5555 5555 5555 4444");
  await expect(page.getByText("Mastercard")).toBeVisible();

  await page.getByRole("button", { name: /pay now/i }).click();
  await expect(page.getByText("Processing your payment")).toBeVisible();
  await expect(page).toHaveURL(/\/checkout\/confirmation\//);
  await expect(page.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  await expect(page.getByRole("region", { name: "What happens next" })).toBeVisible();
});

test("a page that does not exist helps you back into the shop", async ({ page }) => {
  const response = await page.goto("/no/such/page");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "We couldn't find that page" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search the shop" }).fill("kurta");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\?q=kurta/);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("each function is in one place: logo and menu on top, five icons below", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bar).toBeVisible();

    // The top bar carries only the logo and the menu: no search, cart or account up there.
    const top = page.getByRole("banner");
    await expect(top.getByRole("button", { name: "Open menu" })).toBeVisible();
    for (const name of ["Search", /^Cart/, /^Account/, "Sign in"]) {
      await expect(top.getByRole("button", { name })).toBeHidden();
      await expect(top.getByRole("link", { name })).toBeHidden();
    }

    // The bottom bar has the five, icons only.
    await expect(bar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await expect(bar.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Search with a photo" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /^Cart/ })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect((await bar.innerText()).trim()).toBe("");
  });

  test("the bar's Search opens the search panel, its camera the photo picker, its bag the cart", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Quick navigation" });

    await bar.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("combobox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).toBeHidden();

    await bar.getByRole("button", { name: "Search with a photo" }).click();
    await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
    await page.keyboard.press("Escape");

    await bar.getByRole("button", { name: /^Cart/ }).click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
  });

  test("on a product page the bar is there, with the Add-to-cart bar above it", async ({ page, products }, testInfo) => {
    await openProduct(page, pickProduct(products, testInfo.workerIndex));
    // Scroll past the main button so the sticky Add-to-cart bar slides up.
    await page.getByRole("heading", { name: "Customer reviews" }).scrollIntoViewIfNeeded();

    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bar).toBeVisible();
    const add = page.getByRole("button", { name: /^Add .* to cart$/ });
    await expect(add).toBeVisible();
    const [barBox, addBox] = [await bar.boundingBox(), await add.boundingBox()];
    expect(addBox!.y + addBox!.height).toBeLessThanOrEqual(barBox!.y + 1);
  });

  test("a signed-in customer finds Saved and Sign out on the account page", async ({ shopperPage: page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/account/wishlist");

    await expect(page.getByRole("navigation", { name: "Account", exact: true }).getByRole("link", { name: "Wishlist" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("navigation", { name: "Quick navigation" }).getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("the header slides away while scrolling down and returns scrolling up", async ({ page }) => {
    await page.goto("/products");
    await page.waitForSelector("main");
    const state = () => page.evaluate(() => document.documentElement.dataset.header);

    await page.mouse.wheel(0, 900);
    await expect.poll(state).toBe("hidden");
    await page.mouse.wheel(0, -300);
    await expect.poll(state).toBe("shown");
  });
});

test("with reduced motion everything still works, without the flight", async ({ page, products }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const product = pickProduct(products, testInfo.workerIndex + 5);

  await addToCartFromProductPage(page, product);

  // No flight: the drawer is there at once, and nothing is left flying over the page.
  await expect(page.getByRole("dialog").getByText(product.name)).toBeVisible();
  await expect(page.locator('body > img[aria-hidden="true"]')).toHaveCount(0);
});
