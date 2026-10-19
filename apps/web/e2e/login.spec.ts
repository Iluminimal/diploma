import { test, expect } from "./fixtures";
import { uniqueEmail, OTP_CODE } from "./support/api";
import { cartButton, signInThroughTheForm } from "./support/ui";

const accountMenu = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /^Account: / });

test("a new email gets a code by email, which creates the account and asks for a name", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email or phone number").fill(uniqueEmail("register"));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Email me a code instead" }).click();
  await expect(page.getByText(/We sent a 6-digit code to/)).toBeVisible();
  await page.keyboard.type(OTP_CODE);
  await page.getByLabel("Full name").fill("E2E Newcomer");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL("/");
  await expect(accountMenu(page)).toHaveAccessibleName(/E2E Newcomer/);
});

test("signing in with the right password, and a wrong one", async ({ page, account }) => {
  await page.goto("/login");

  await page.getByLabel("Email or phone number").fill(account.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").getByText(/don't match/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(accountMenu(page)).toBeVisible();
});

test("signing in returns to the page that asked for it", async ({ page, account }) => {
  await page.goto("/account/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Forders/);

  await signInThroughTheForm(page, account.email, account.password);

  await expect(page).toHaveURL(/\/account\/orders$/);
});

test("a sign-in link cannot send the customer to another site", async ({ page, account }) => {
  await page.goto("/login?next=//evil.example.com");

  await signInThroughTheForm(page, account.email, account.password);

  await expect(page).toHaveURL("/");
});

test("the session survives a reload, and signing out ends it", async ({ shopperPage: page }) => {
  await page.goto("/account/orders");
  await expect(accountMenu(page)).toBeVisible();

  await page.reload();
  await expect(accountMenu(page)).toBeVisible();

  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  await page.goto("/account/orders");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("the cart is not shown to someone who signed out", async ({ shopperPage: page, api, account, products }) => {
  const { addToCart } = await import("./support/api");
  await addToCart(api, account, products[0]!.id);
  await page.goto("/");
  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag, 1 items");

  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  await expect(cartButton(page)).toHaveAttribute("aria-label", "Bag");
});
