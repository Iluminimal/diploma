import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  createProduct,
  inStockProducts,
  registerAccount,
  signInAccount,
  warehouseSession,
  withdrawProduct,
  type Account,
  type CatalogProduct,
} from "./support/api";
import { ADMIN_EMAIL, ADMIN_PASSWORD, WAREHOUSE_EMAIL, WAREHOUSE_PASSWORD } from "./support/env";
import { withEnglish } from "./support/locale";

type Fixtures = {
  /** Шинэ хэрэглэгч (API session). */
  account: Account;
  /** Аль хэдийн `account`-аар нэвтэрсэн browser хуудас. */
  shopperPage: Page;
  /** e2e админаар нэвтэрсэн browser хуудас (захиалга цуцлах/буцаах, хэрэглэгч, статистик; барааг зөвхөн харна). */
  adminPage: Page;
  /** e2e агуулахын ажилтнаар нэвтэрсэн browser хуудас (бараа, нөөц, захиалгын ачилт). */
  warehousePage: Page;
  /** Энэ тестэд зориулсан нөөцтэй хувцас (worker бүрт өөр бараа, ингэснээр нөөц мөргөлдөхгүй). */
  products: CatalogProduct[];
  api: APIRequestContext;
  /** Энэ тестийн өөрийн бараа үүсгэнэ; тест дуусахад хасагдана. */
  newProduct: (options?: { name?: string; stock?: number }) => Promise<{ id: number; name: string }>;
};

// Playwright fixture бүрт `use` гэж нэрлэдэг callback өгдөг. Энд `provide` гэж нэрлэсэн, учир нь
// React hook-ийн lint дүрэм `use(...)` дуудлага бүрийг hook гэж үздэг.
export const test = base.extend<Fixtures>({
  api: async ({ playwright }, provide) => {
    const context = await playwright.request.newContext();
    await provide(context);
    await context.dispose();
  },
  products: async ({ api }, provide) => provide(await inStockProducts(api)),
  account: async ({ api }, provide) => provide(await registerAccount(api)),
  shopperPage: async ({ browser, account }, provide) => {
    const context = await browser.newContext({ storageState: withEnglish(account.cookies) });
    await provide(await context.newPage());
    await context.close();
  },
  newProduct: async ({ api }, provide) => {
    const worker = await warehouseSession(api);
    const made: number[] = [];
    await provide(async (options) => {
      const product = await createProduct(api, worker, options);
      made.push(product.id);
      return product;
    });
    for (const id of made) await withdrawProduct(api, worker, id);
  },
  adminPage: async ({ browser, playwright }, provide) => {
    const request = await playwright.request.newContext();
    const admin = await signInAccount(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    await request.dispose();
    const context = await browser.newContext({ storageState: withEnglish(admin.cookies) });
    await provide(await context.newPage());
    await context.close();
  },
  warehousePage: async ({ browser, playwright }, provide) => {
    const request = await playwright.request.newContext();
    const worker = await signInAccount(request, WAREHOUSE_EMAIL, WAREHOUSE_PASSWORD);
    await request.dispose();
    const context = await browser.newContext({ storageState: withEnglish(worker.cookies) });
    await provide(await context.newPage());
    await context.close();
  },
});

export { expect };
