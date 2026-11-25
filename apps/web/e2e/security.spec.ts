import { test, expect } from "./fixtures";
import { pickProduct, openProduct } from "./support/ui";

/**
 * Content-Security-Policy (src/proxy.ts): production build дээр хатуу мөрдөгддөг тул хуудас бүр
 * зөрчилгүй ажиллах ёстой. Browser-ийн `securitypolicyviolation` үйл явдлыг цуглуулж шалгана.
 */
async function watchCsp(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  return () => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

test("the storefront pages run under the Content-Security-Policy without a single violation", async ({
  page,
  products,
}, testInfo) => {
  const violations = await watchCsp(page);
  const product = pickProduct(products, testInfo.workerIndex);
  const seen: Record<string, string[]> = {};

  for (const path of ["/", "/products", `/products?q=${encodeURIComponent(product.name.split(" ")[0] ?? "a")}`, "/c/men", "/search", "/cart", "/login"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    seen[path] = await violations();
  }
  await openProduct(page, product);
  seen["product"] = await violations();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("/");
  await page.keyboard.type("dress");
  await expect(page.getByRole("listbox")).toBeVisible();
  seen["search suggestions"] = await violations();

  expect(Object.fromEntries(Object.entries(seen).filter(([, list]) => list.length > 0))).toEqual({});
});

test("a signed-in customer's pages and the admin area run under it too", async ({ shopperPage, adminPage }) => {
  for (const [page, paths] of [
    [shopperPage, ["/account/profile", "/account/orders"]],
    [adminPage, ["/admin", "/admin/orders", "/admin/activity"]],
  ] as const) {
    const violations = await watchCsp(page);
    for (const path of paths) {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await violations(), path).toEqual([]);
    }
  }
});

test("pages carry the security headers, and the policy has a fresh nonce each time", async ({ request }) => {
  const first = await request.get("/");
  const second = await request.get("/");

  const policy = first.headers()["content-security-policy"] ?? first.headers()["content-security-policy-report-only"];
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("'unsafe-inline'; img"); // script-src nonce-д суурилсан
  expect(first.headers()["x-frame-options"]).toBe("DENY");
  expect(first.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(first.headers()["permissions-policy"]).toContain("camera=(self)");
  expect(first.headers()["x-powered-by"]).toBeUndefined();
  const nonce = (header: string | undefined) => /'nonce-([^']+)'/.exec(header ?? "")?.[1];
  const other = second.headers()["content-security-policy"] ?? second.headers()["content-security-policy-report-only"];
  expect(nonce(policy)).toBeTruthy();
  expect(nonce(policy)).not.toBe(nonce(other));
});

test("a weak password is refused when registering, with the reason", async ({ request }) => {
  const response = await request.post("/api/v1/auth/register", {
    data: { email: `weak-${Date.now()}@example.com`, password: "password1234", full_name: "Weak Test" },
  });

  expect(response.status()).toBe(422);
  expect((await response.json()).reason).toBe("common");
});
