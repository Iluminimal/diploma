import { expect, test } from "@playwright/test";

// Cookie-гүй зочин: хөтчийн хэл англи байсан ч сайт монгол хэлээр нээгдэнэ.
test.use({ storageState: { cookies: [], origins: [] }, locale: "en-US" });

test("a first-time visitor reads Mongolian even with an English browser", async ({ page, context }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "mn");
  await expect(page.getByRole("link", { name: "Сагс" }).first()).toBeVisible();
  await expect(page.getByText("Delivery")).toHaveCount(0);
  expect((await context.cookies()).some((c) => c.name === "NEXT_LOCALE")).toBe(false);
});

test("the language switcher still gives the visitor English, and remembers it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Хэл ба валют/ }).first().click();
  await page.getByRole("menuitemradio", { name: "English" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
