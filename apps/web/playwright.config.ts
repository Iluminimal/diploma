import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive a running stack: the API, the web app and Postgres/Redis (see
 * docs/e2e.md). They never start servers themselves, so the same suite runs against a local
 * `make api` + `make web-prod`, or against the CI stack.
 *
 *   E2E_BASE_URL   where the web app is served (default http://localhost:3000)
 *   E2E_API_URL    where the API is served (default http://localhost:8000)
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
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
