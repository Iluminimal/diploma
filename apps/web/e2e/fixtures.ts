import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  inStockProducts,
  registerAccount,
  signInAccount,
  type Account,
  type CatalogProduct,
} from "./support/api";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./support/env";

type Fixtures = {
  /** A fresh customer (API session). */
  account: Account;
  /** A browser page already signed in as `account`. */
  shopperPage: Page;
  /** A browser page signed in as the e2e administrator. */
  adminPage: Page;
  /** In-stock apparel for this test (a different product per worker, to avoid stock collisions). */
  products: CatalogProduct[];
  api: APIRequestContext;
};

// Playwright hands each fixture a callback that is conventionally called `use`; it is named
// `provide` here because the React hooks lint rule takes any `use(...)` call for a hook.
export const test = base.extend<Fixtures>({
  api: async ({ playwright }, provide) => {
    const context = await playwright.request.newContext();
    await provide(context);
    await context.dispose();
  },
  products: async ({ api }, provide) => provide(await inStockProducts(api)),
  account: async ({ api }, provide) => provide(await registerAccount(api)),
  shopperPage: async ({ browser, account }, provide) => {
    const context = await browser.newContext({ storageState: { cookies: account.cookies, origins: [] } });
    await provide(await context.newPage());
    await context.close();
  },
  adminPage: async ({ browser, playwright }, provide) => {
    const request = await playwright.request.newContext();
    const admin = await signInAccount(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    await request.dispose();
    const context = await browser.newContext({ storageState: { cookies: admin.cookies, origins: [] } });
    await provide(await context.newPage());
    await context.close();
  },
});

export { expect };
