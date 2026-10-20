import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end тестүүд ажиллаж буй stack (API, web, Postgres/Redis)-ийг удирдана (docs/e2e.md).
 * Тест өөрөө server асаадаггүй тул нэг тест локал `make api` + `make web-prod` дээр ч, CI stack дээр ч ажиллана.
 *
 *   E2E_BASE_URL   web ажиллаж буй хаяг (анхдагч http://localhost:3000)
 *   E2E_API_URL    API ажиллаж буй хаяг (анхдагч http://localhost:8000)
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  expect: { timeout: 10_000 },
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Хиймэл камер: "Зураг авах" товчийг тестлэхэд хэрэгтэй, өөр юу ч үүнийг ашигладаггүй.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
