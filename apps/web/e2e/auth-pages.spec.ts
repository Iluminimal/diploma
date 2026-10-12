import { test, expect } from "./fixtures";
import { API_URL } from "./support/env";

test("the register page speaks of signing up, shows a password strength and lets you see the password", async ({ page, api }) => {
  const providers = await (await api.get(`${API_URL}/api/v1/auth/providers`)).json();
  await page.goto("/register");

  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("short");
  await expect(page.getByText("5 more characters needed")).toBeVisible();
  await password.fill("a long enough passphrase");
  await expect(page.getByText("Excellent")).toBeVisible();
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  if (providers.google) {
    await expect(page.getByRole("link", { name: "Sign up with Google" })).toBeVisible();
    await expect(page.getByText(/create your account from your Google name and email/)).toBeVisible();
  }
});

test("the sign in page points people who used Google to the Google button when a password fails", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator('form p[role="alert"]')).toContainText("Signed up with Google? Use “Continue with Google” instead.");
});

test("the two pages keep where you were going", async ({ page }) => {
  await page.goto("/login?next=/account/orders");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();

  await expect(page).toHaveURL(/\/register\?next=%2Faccount%2Forders$/);
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).last()).toHaveAttribute("href", /next=%2Faccount%2Forders/);
});
