import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { API_URL, PASSWORD } from "./support/env";
import { OTP_CODE, signInAccount, signUpWithPhone, uniquePhone } from "./support/api";

// Эдгээр тест API-г OTP_DEV_CODE=000000-тэй ажиллуулахыг шаарддаг (docs/e2e.md): тэгвэл код болгон
// 000000 байна.

const accountMenu = (page: Page) => page.getByRole("button", { name: /^Account: / });
/**
 * "+14155550123" -> "+1 415 555 0123": бүтнээр нь бичсэн дугаар сонгогчийн утгаас үл хамааран
 * өөрийн улсыг сонгоно.
 */
const national = (phone: string) => phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 $1 $2 $3");

/** Dialog-ийн хоёр дахь алхам: код илгээснээс хойш зургаан нүд гарна. */
async function typeCodeInDialog(page: Page) {
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(OTP_CODE);
}

async function askForCode(page: Page, phone: string) {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(national(phone));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/We sent a 6-digit code to/)).toBeVisible();
}

test("a new phone number signs up with a code and is asked for a name", async ({ page }) => {
  const phone = uniquePhone();
  await askForCode(page, phone);

  await page.keyboard.type(OTP_CODE);
  await page.getByLabel("Full name").fill("Phone Newcomer");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL("/");
  await expect(accountMenu(page)).toHaveAccessibleName(/Phone Newcomer/);
});

test("the same number signs in again without asking for a name", async ({ page, api }) => {
  const phone = uniquePhone();
  await signUpWithPhone(api, phone);
  await askForCode(page, phone);

  await page.keyboard.type(OTP_CODE);

  await expect(page).toHaveURL("/");
  await expect(accountMenu(page)).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
});

test("a wrong code is refused and the boxes are cleared", async ({ page }) => {
  await askForCode(page, uniquePhone());

  await page.keyboard.type("111111");

  await expect(page.locator('p[role="alert"]')).toContainText("That code isn't right");
  await expect(page.getByLabel("Digit 1 of 6")).toHaveValue("");
  await expect(page).toHaveURL(/\/login/);
});

test("a number that cannot be right is caught before anything is sent", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill("12");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Enter a valid phone number.")).toBeVisible();
});

test("a phone customer adds an email, changes the number and signs out the other devices", async ({ page, api, browser }) => {
  const phone = uniquePhone();
  const session = await signUpWithPhone(api, phone);
  await page.context().addCookies(session.cookies);
  await page.goto("/account/profile");
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
  await expect(page.getByText(phone).first()).toBeVisible();

  // Имэйл нэмэх: шинэ хаяг руу код очно; утасны account-д нотлох нууц үг байхгүй.
  await page.getByRole("button", { name: /Add an email/ }).click();
  const email = `e2e-phone-${Date.now().toString(36)}@example.com`;
  await page.getByRole("dialog").getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await typeCodeInDialog(page);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove phone" })).toBeVisible();

  // Дугаар солих: код шинэ дугаар руу очно.
  const replacement = uniquePhone();
  await page.getByRole("button", { name: "Change phone" }).click();
  await page.getByRole("dialog").getByLabel("Phone number").fill(national(replacement));
  await page.getByRole("button", { name: "Send code" }).click();
  await typeCodeInDialog(page);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(replacement).first()).toBeVisible();

  // Хоёр дахь төхөөрөмж нэвтэрч, эхнийхийг нь гаргана.
  const other = await browser.newContext();
  const otherApi = other.request;
  await otherApi.post(`${API_URL}/api/v1/auth/otp/request`, { data: { destination: replacement } });
  await otherApi.post(`${API_URL}/api/v1/auth/otp/verify`, { data: { destination: replacement, code: OTP_CODE } });
  await page.reload();
  const devices = page.getByRole("list", { name: "Devices" });
  await expect(devices.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Sign out everywhere else" }).click();
  await expect(devices.getByRole("listitem")).toHaveCount(1);
  expect((await otherApi.post(`${API_URL}/api/v1/auth/refresh`)).status()).toBe(401);
  await other.close();
});

test("a forgotten password is replaced with a code", async ({ page, account }) => {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(account.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);

  await page.getByLabel("Email or phone number").fill(account.email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/we sent it a 6-digit code/)).toBeVisible();
  await page.keyboard.type(OTP_CODE);
  await page.getByLabel("New password").fill("a brand new passphrase 42");
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page).toHaveURL("/");
  await expect(accountMenu(page)).toBeVisible();
  const api = page.context().request;
  expect((await api.post(`${API_URL}/api/v1/auth/login`, { data: { email: account.email, password: PASSWORD } })).status()).toBe(401);
  expect((await signInAccount(api, account.email, "a brand new passphrase 42")).token).toBeTruthy();
});
