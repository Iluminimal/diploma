import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { uniqueEmail } from "./support/api";
import { API_URL } from "./support/env";
import { addToCartFromProductPage, cartButton } from "./support/ui";

/**
 * API-ийн суулгасан хуурамч Google-ээр (OAUTH_MODE=fake) нэвтрэх: Google-ийн зөвшөөрлийн дэлгэцийг
 * алгасдаг ч жинхэнэ урсгал (эхлэх, state cookie, callback, session, сагс нэгтгэх) ажиллана. Fake
 * байхгүй бол дарах товч байхгүй (эсвэл Google key болон жинхэнэ Google account хэрэгтэй) тул
 * эдгээр тест skip болно.
 */
test.beforeEach(async ({ api }) => {
  const providers = await (await api.get(`${API_URL}/api/v1/auth/providers`)).json();
  test.skip(!providers.google, "needs the API to run with OAUTH_MODE=fake");
});

/** Товч хэн нэвтэрч байгааг мэдэхгүй; fake үүнийг `login_hint`-ээс авна. */
async function signInAs(page: Page, email: string) {
  await page.route("**/api/v1/auth/google/start*", (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("login_hint", email);
    return route.continue({ url: url.toString() });
  });
}

// Next өөрийн role="alert"-ийг нэмдэг (route announcer): манайх нь догол мөр.
const problem = (page: Page) => page.locator('p[role="alert"]');
const google = (page: Page) => page.getByRole("link", { name: /^Continue with Google$/ });

async function whoAmI(page: Page) {
  // Хуудас ачаалахдаа өөрийн session-ийг сэргээж, refresh token-ыг сольдог: үүнийг дуустал хүлээ,
  // эс бөгөөс энэ дуудлага refresh race-д ялагдана (API зориудаар татгалздаг).
  await page.waitForLoadState("networkidle");
  const response = await page.request.post("/api/v1/auth/refresh");
  expect(response.ok()).toBe(true);
  return (await response.json()).user as { id: number; email: string };
}

test("Continue with Google signs a new customer in and returns to the page they asked for", async ({ page }) => {
  const email = uniqueEmail("google");
  await signInAs(page, email);
  await page.goto("/login?next=/account/orders");

  await google(page).click();

  await expect(page).toHaveURL(/\/account\/orders$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect((await whoAmI(page)).email).toBe(email);
});

test("the old register address leads to the same page, and it offers Google too", async ({ page }) => {
  await signInAs(page, uniqueEmail("google"));
  await page.goto("/register");

  await google(page).click();

  await expect(page).toHaveURL(/localhost:\d+\/$/);
  expect((await whoAmI(page)).id).toBeGreaterThan(0);
});

test("a guest's cart comes along", async ({ page, products }) => {
  await addToCartFromProductPage(page, products[0]!);
  await page.keyboard.press("Escape");
  await signInAs(page, uniqueEmail("google"));
  await page.goto("/login");

  await google(page).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(cartButton(page)).toHaveAttribute("aria-label", /Bag, 1 item/);
});

test("an existing password account is linked, and its password stops working", async ({ page, api, account }) => {
  const before = await api.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  expect(before.ok()).toBe(true);
  await signInAs(page, account.email);
  await page.goto("/login");

  await google(page).click();

  await expect(page).toHaveURL(/\/$/);
  expect((await whoAmI(page)).email).toBe(account.email);
  const after = await api.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  expect(after.status()).toBe(401);
});

test("cancelling at Google ends on the login page with a message", async ({ page }) => {
  await page.goto("/api/v1/auth/google/callback?error=access_denied");

  await expect(page).toHaveURL(/\/login\?error=google_denied$/);
  await expect(problem(page)).toContainText("cancelled");
  await expect(page.getByLabel("Email or phone number")).toBeVisible();
});

test("an unverified Google email is refused", async ({ page }) => {
  await signInAs(page, `unverified:${uniqueEmail("google")}`);
  await page.goto("/login");

  await google(page).click();

  await expect(page).toHaveURL(/\/login\?error=google_unverified$/);
  await expect(problem(page)).toContainText("verified");
  expect((await page.request.post("/api/v1/auth/refresh")).status()).toBe(401);
});

test("a login link cannot put its own words or a foreign address on the page", async ({ page }) => {
  await page.goto("/login?error=%3Cb%3Ehello%3C/b%3E");
  await expect(problem(page)).toHaveCount(0);

  await signInAs(page, uniqueEmail("google"));
  await page.goto("/login?next=//evil.example");
  await google(page).click();

  await expect(page).toHaveURL(/localhost:\d+\/$/);
});
