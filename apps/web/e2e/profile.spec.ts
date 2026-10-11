import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { uniqueEmail } from "./support/api";
import { API_URL, PASSWORD } from "./support/env";

const NEW_PASSWORD = "an entirely new passphrase";
const login = (api: import("@playwright/test").APIRequestContext, email: string, password: string) =>
  api.post(`${API_URL}/api/v1/auth/login`, { data: { email, password } });

/** The page restores its session on load; wait for that before reading or acting on the account. */
async function openProfile(page: Page) {
  await page.goto("/account/profile");
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
}

test("the profile page shows who you are and how you sign in", async ({ shopperPage: page, account }) => {
  await openProfile(page);

  await expect(page.getByLabel("Full name")).toHaveValue("E2E Shopper");
  await expect(page.getByLabel("Email")).toHaveValue(account.email);
  await expect(page.getByText(/Not connected/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Change password/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account", exact: true }).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
});

test("renaming shows up in the header and survives a reload", async ({ shopperPage: page }) => {
  await openProfile(page);
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  await page.getByLabel("Full name").fill("Grace Hopper");
  await save.click();

  await expect(page.getByRole("button", { name: "Account: Grace Hopper" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Grace Hopper");
});

test("changing the password works, needs the current one, and ends the old one", async ({ shopperPage: page, api, account }) => {
  await openProfile(page);
  await page.getByRole("button", { name: /Change password/ }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Current password").fill("not it at all");
  await dialog.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await dialog.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await expect(dialog.getByText("Excellent")).toBeVisible();
  await dialog.getByRole("button", { name: "Change password" }).click();
  await expect(dialog.getByText("That isn't your current password")).toBeVisible();

  await dialog.getByLabel("Current password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Change password" }).click();

  await expect(dialog).toBeHidden();
  expect((await login(api, account.email, NEW_PASSWORD)).ok()).toBe(true);
  expect((await login(api, account.email, PASSWORD)).status()).toBe(401);
});

test("a Google account sees it connected and can add a password", async ({ page, api }) => {
  const email = uniqueEmail("profile-google");
  await page.route("**/api/v1/auth/google/start*", (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("login_hint", email);
    return route.continue({ url: url.toString() });
  });
  const providers = await (await api.get(`${API_URL}/api/v1/auth/providers`)).json();
  test.skip(!providers.google, "needs the API to run with OAUTH_MODE=fake");
  await page.goto("/login?next=/account/profile");
  await page.getByRole("link", { name: /Continue with Google/ }).click();

  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByText("Connected")).toBeVisible();
  await expect(page.getByText(/Not set\. You sign in with Google/)).toBeVisible();
  await page.getByRole("button", { name: /Set a password/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Current password")).toHaveCount(0);
  await dialog.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await dialog.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await dialog.getByRole("button", { name: "Set password" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /Change password/ })).toBeVisible();
  expect((await login(api, email, NEW_PASSWORD)).ok()).toBe(true);
});

test("deleting the account needs the email and password, then signs you out for good", async ({
  shopperPage: page,
  api,
  account,
}) => {
  await openProfile(page);
  await page.getByRole("button", { name: /Delete my account/ }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete account" });
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel("Your email").fill(account.email);
  await dialog.getByLabel("Your password").fill("a wrong password");
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("That password isn't right.");

  await dialog.getByLabel("Your password").fill(PASSWORD);
  await confirm.click();

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await login(api, account.email, PASSWORD)).status()).toBe(401);
});

test("the account menu leads to the profile", async ({ shopperPage: page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Account:/ }).click();

  await page.getByRole("menuitem", { name: "Profile" }).click();

  await expect(page).toHaveURL(/\/account\/profile$/);
});
