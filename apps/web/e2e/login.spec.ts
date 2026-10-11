import { test, expect } from "./fixtures";
import { PASSWORD } from "./support/env";
import { uniqueEmail } from "./support/api";
import { signInThroughTheForm } from "./support/ui";

const accountMenu = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /^Account: / });

test("registering signs the new customer in", async ({ page }) => {
  await page.goto("/register");

  await page.getByLabel("Full name").fill("E2E Newcomer");
  await page.getByLabel("Email").fill(uniqueEmail("register"));
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
  await expect(accountMenu(page)).toBeVisible();
});

test("an email that is already registered is refused", async ({ page, account }) => {
  await page.goto("/register");

  await page.getByLabel("Full name").fill("Someone Else");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert").getByText(/already exists/)).toBeVisible();
});

test("signing in with the right password, and a wrong one", async ({ page, account }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill(account.email);
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
  await expect(page.locator('button[aria-label^="Cart"]')).toHaveAttribute("aria-label", "Cart, 1 items");

  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  await expect(page.locator('button[aria-label^="Cart"]')).toHaveAttribute("aria-label", "Cart");
});
