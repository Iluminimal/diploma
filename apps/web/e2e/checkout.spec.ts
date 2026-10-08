import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { addAddress, addToCart, placePaidOrder, registerAccount } from "./support/api";
import { API_URL } from "./support/env";
import { addToCartFromProductPage, pickProduct } from "./support/ui";

test("checkout needs an account", async ({ page, products }, testInfo) => {
  await addToCartFromProductPage(page, pickProduct(products, testInfo.workerIndex));

  await page.goto("/checkout");

  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
});

test("an empty cart cannot be checked out", async ({ shopperPage: page }) => {
  await page.goto("/checkout");

  await expect(page.getByRole("button", { name: /pay now/i })).toHaveCount(0);
  await expect(page.getByText(/cart is empty/i).first()).toBeVisible();
});

test("a signed-in shopper pays with the demo card and sees the order afterwards", async ({
  shopperPage: page,
  products,
}, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 1);
  await addToCartFromProductPage(page, product);
  await page.getByRole("dialog").getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  // A new address, saved and selected.
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Address", { exact: true }).fill("12 Analytical Way");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("Postal code").fill("12345");
  await page.getByRole("button", { name: "Use this address" }).click();
  await expect(page.getByRole("radio", { name: /Ada Lovelace/ })).toBeChecked();
  await expect(page.getByText("Demo payment, no real charge.", { exact: false }).first()).toBeVisible();

  // Express shipping costs more.
  const pay = page.getByRole("button", { name: /pay now/i });
  const standard = await pay.innerText();
  await page.locator("label", { hasText: "Express shipping" }).click();
  await expect.poll(() => pay.innerText()).not.toBe(standard);

  await pay.click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\//);
  await expect(page.getByRole("heading", { name: "Thank you for your order" })).toBeVisible();
  const number = /LK-[A-Z0-9]{8}/.exec(await page.locator("main").innerText())?.[0];
  expect(number).toBeTruthy();

  // The cart is empty, and the order is in the account with the address and the line as bought.
  await page.goto("/account/orders");
  await page.getByRole("link", { name: new RegExp(number!) }).click();
  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
  await expect(page.getByText("12 Analytical Way").first()).toBeVisible();
  await expect(page.getByText(product.name).first()).toBeVisible();
  await expect(page.locator('button[aria-label^="Cart"]')).toHaveAttribute("aria-label", "Cart");
});

test("repeating a checkout request, or the payment, never creates a second order or charge", async ({
  api,
  account,
  products,
}, testInfo) => {
  const product = pickProduct(products, testInfo.workerIndex + 2);
  const headers = { "content-type": "application/json", Authorization: `Bearer ${account.token}` };
  await addToCart(api, account, product.id);
  const addressId = await addAddress(api, account);
  const key = `e2e-${randomUUID()}`;
  const checkout = () =>
    api.post(`${API_URL}/api/v1/checkout`, {
      headers: { ...headers, "Idempotency-Key": key },
      data: { address_id: addressId, shipping_method: "standard" },
    });

  const first = (await (await checkout()).json()) as { order: { number: string } };
  const replay = (await (await checkout()).json()) as { order: { number: string } };
  expect(replay.order.number).toBe(first.order.number);

  const pay = () => api.post(`${API_URL}/api/v1/checkout/orders/${first.order.number}/simulate-payment`, { headers });
  expect((await pay()).status()).toBe(200);
  expect((await pay()).status()).toBe(200);

  const orders = (await (await api.get(`${API_URL}/api/v1/orders`, { headers })).json()) as {
    total: number;
    items: { number: string; status: string }[];
  };
  expect(orders.total).toBe(1);
  expect(orders.items[0]).toMatchObject({ number: first.order.number, status: "paid" });
});

test("another customer cannot see an order, in the app or in the API", async ({
  api,
  account,
  products,
  browser,
  playwright,
}, testInfo) => {
  const number = await placePaidOrder(api, account, pickProduct(products, testInfo.workerIndex + 3).id);
  const otherApi = await playwright.request.newContext();
  const other = await registerAccount(otherApi, "other");

  const direct = await otherApi.get(`${API_URL}/api/v1/orders/${number}`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  expect(direct.status()).toBe(404);

  const context = await browser.newContext({ storageState: { cookies: other.cookies, origins: [] } });
  const page = await context.newPage();
  await page.goto(`/account/orders/${number}`);
  await expect(page.getByText("We couldn't find that order on your account.")).toBeVisible();
  await context.close();
  await otherApi.dispose();

  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(`/account/orders/${number}`);
  await expect(visitor).toHaveURL(/\/login\?next=/);
  await anonymous.close();
});
