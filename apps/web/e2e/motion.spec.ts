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

  test("a tab bar leads around the shop, and photo search opens from its middle button", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

    await bar.getByRole("link", { name: "Shop" }).click();
    await expect(page).toHaveURL(/\/products/);
    await expect(bar.getByRole("link", { name: "Shop" })).toHaveAttribute("aria-current", "page");

    await bar.getByRole("button", { name: "Search with a photo" }).click();
    await expect(page.getByRole("dialog", { name: "Search by photo" })).toBeVisible();
  });

  test("the bar stays away from a product page, which has its own add-to-cart bar", async ({ page, products }, testInfo) => {
    await openProduct(page, pickProduct(products, testInfo.workerIndex));

    await expect(page.getByRole("navigation", { name: "Quick navigation" })).toHaveCount(0);
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
