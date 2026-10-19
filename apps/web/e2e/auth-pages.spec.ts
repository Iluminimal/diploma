import { test, expect } from "./fixtures";
import { API_URL } from "./support/env";

test("the sign in page is one field for an email or a phone number, then Google", async ({ page, api }) => {
  const providers = await (await api.get(`${API_URL}/api/v1/auth/providers`)).json();
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in or create account" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  const field = page.getByLabel("Email or phone number");
  await expect(field).toBeFocused();
  await field.fill("4155552671");
  await expect(page.getByRole("combobox", { name: "Country" })).toBeVisible();
  await field.fill("someone@example.com");
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveCount(0);
  if (providers.google) await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
});

test("an email goes on to the password, and Edit goes back with the email kept", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email or phone number").fill("someone@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  const password = page.getByLabel("Password", { exact: true });
  await expect(page.getByRole("heading", { name: "Enter your password" })).toBeVisible();
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: /^Change / }).click();

  await expect(page.getByLabel("Email or phone number")).toHaveValue("someone@example.com");
});

test("a wrong password points people who used Google or a code to the other ways in", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email or phone number").fill("nobody-here@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const alert = page.locator('p[role="alert"]');
  await expect(alert).toContainText("Get a code by email instead");
  await expect(alert).toContainText("Continue with Google");
});

test("the old register address leads to the sign in page and keeps where you were going", async ({ page }) => {
  await page.goto("/register?next=/account/orders");

  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Forders$/);
  await expect(page.getByRole("heading", { name: "Sign in or create account" })).toBeVisible();
});
