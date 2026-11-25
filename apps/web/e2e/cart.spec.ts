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
  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag, 1 item");
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

  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag, 1 item");
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

test("quick add on a card: a size is asked for once, then the Bag opens with that line", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 2);
  await page.goto(`/products?q=${encodeURIComponent(product.name)}`);

  const card = page.getByRole("article").filter({ hasText: product.name }).first();
  await card.hover();
  await card.getByRole("button", { name: `Quick add ${product.name}` }).click();
  const size = await page.getByRole("group", { name: new RegExp(`Choose a size for ${product.name}`) }).getByRole("radio").first().evaluate((el) => (el as HTMLInputElement).value);
  await page.getByRole("group", { name: new RegExp(`Choose a size for ${product.name}`) }).getByLabel(size, { exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(product.name)).toBeVisible();
  await expect(drawer.getByText(new RegExp(`Size ${size}`))).toBeVisible();
});

test("a misspelled search still finds the product and says the results are the closest", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex);
  const word = product.name.split(" ").find((part) => part.length >= 6) ?? product.name;
  const typo = word.slice(0, 3) + word.slice(4, 5) + word.slice(3, 4) + word.slice(5);
  await page.goto(`/products?q=${encodeURIComponent(typo)}`);

  await expect(page.getByRole("status").filter({ hasText: /No exact matches for/ })).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();
});

test("a product page offers things to wear with it and a delivery line under the price", async ({ page, products }, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex);
  await openProduct(page, product);

  await expect(page.getByRole("heading", { level: 2, name: "Complete the look" })).toBeVisible();
  await expect(page.getByText(/Standard shipping/).first()).toBeVisible();
});

test("an empty search offers best sellers instead of a dead end", async ({ page }) => {
  await page.goto("/products?q=qzxwvqzxwv");

  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Best sellers" })).toBeVisible();
});

test("buy again puts a past order back in the Bag", async ({ shopperPage: page, api, account, products }, testInfo) => {
  const { placePaidOrder } = await import("./support/api");
  const product = pickProduct(products, testInfo.workerIndex + 3);
  const number = await placePaidOrder(api, account, product.id);

  await page.goto(`/account/orders/${number}`);
  await page.getByRole("button", { name: "Buy again" }).click();

  await expect(page.getByRole("dialog").getByText(product.name)).toBeVisible();
  await expect(cartButton(page)).toHaveAttribute("aria-label", /Bag, \d+ items?/);
});
