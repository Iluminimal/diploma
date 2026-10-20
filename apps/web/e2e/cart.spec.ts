import { test, expect } from "./fixtures";
import { addToCart } from "./support/api";
import {
  addToCartFromProductPage,
  cartButton,
  chooseSize,
  money,
  openProduct,
  pickProduct,
  signInThroughTheForm,
} from "./support/ui";

test("a guest adds to the cart: a size is required, the Bag shows the line, the badge counts it", async ({
  page,
  products,
}, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex);
  await openProduct(page, product);

  await page.getByRole("button", { name: /add to bag/i }).click();
  await expect(page.getByText("Please select a size.")).toBeVisible();
  const size = await chooseSize(page);
  await page.getByRole("button", { name: /add to bag/i }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(product.name)).toBeVisible();
  await expect(drawer.getByText(new RegExp(`Size ${size}`))).toBeVisible();
  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag, 1 items");
});

test("quantities can be changed on the cart page, and stop at the stock on hand", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 1);
  await addToCartFromProductPage(page, product);
  await page.getByRole("dialog").getByRole("link", { name: "View Bag" }).click();
  await expect(page).toHaveURL(/\/cart$/);

  const increase = page.locator("main").getByRole("button", { name: `Increase quantity of ${product.name}` });
  await increase.click();
  await expect(page.getByText("Subtotal (2 items)")).toBeVisible();
  await expect(page.getByText(money(product.price_cents * 2)).first()).toBeVisible();

  for (let clicks = 0; clicks < 12 && (await increase.isEnabled()); clicks += 1) {
    await increase.click();
    await page.waitForTimeout(150);
  }
  await expect(increase).toBeDisabled(); // нөөцийн хязгаар (эсвэл мөр бүрийн хязгаар) хүрсэн

  const remove = page.locator("main").getByRole("button", { name: new RegExp(`Remove ${product.name}`) });
  await remove.click();
  await expect(page.getByText("Your Bag is empty")).toBeVisible();
});

test("the guest's cart survives a reload", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 2);
  await addToCartFromProductPage(page, product);

  await page.reload();

  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag, 1 items");
});

test("signing in merges the guest's cart into the account's", async ({ page, account, api, products }, testInfo) => {
  const [mine, theirs] = [pickProduct(products, testInfo.workerIndex + 3), pickProduct(products, testInfo.workerIndex + 4)];
  await addToCart(api, account, theirs.id); // account-ын сагсанд аль хэдийн байгаа
  await addToCartFromProductPage(page, mine); // зочноор нэмсэн

  await page.goto("/login?next=/cart");
  await signInThroughTheForm(page, account.email, account.password);

  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { name: mine.name }).or(page.getByRole("link", { name: mine.name })).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: theirs.name }).or(page.getByRole("link", { name: theirs.name })).first()).toBeVisible();
  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag, 2 items");
});

test("the wishlist asks a guest to sign in", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 5);
  await openProduct(page, product);

  await page.getByRole("button", { name: /save .* to your wishlist/i }).first().click();

  await expect(page).toHaveURL(/\/login\?next=/);
});
