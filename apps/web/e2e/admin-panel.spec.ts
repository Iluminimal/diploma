import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  adminSession,
  orderOf,
  placePaidOrder,
  placePendingOrder,
  registerAccount,
  stockOf,
} from "./support/api";
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, PASSWORD } from "./support/env";

/** Sign in through the form, as a person would. */
async function signInThroughTheForm(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("landing", () => {
  test("an administrator lands in the admin area, a customer in the store", async ({ browser, account }) => {
    const admin = await (await browser.newContext()).newPage();
    await signInThroughTheForm(admin, ADMIN_EMAIL, ADMIN_PASSWORD);

    await expect(admin).toHaveURL(/\/admin$/);
    await expect(admin.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    const customer = await (await browser.newContext()).newPage();
    await signInThroughTheForm(customer, account.email, account.password);

    await expect(customer).toHaveURL(/localhost:\d+\/$/);
    await expect(customer.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("an administrator who was headed somewhere else still goes there", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();

    await signInThroughTheForm(page, ADMIN_EMAIL, ADMIN_PASSWORD, "/cart");

    await expect(page).toHaveURL(/\/cart$/);
  });

  test("the admin area has its own shell: no shop navigation or footer, and a way back to the store", async ({
    adminPage: page,
  }) => {
    await page.goto("/admin");

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Admin" });
    for (const section of ["Dashboard", "Orders", "Products", "Inventory", "Customers", "Reviews"]) {
      await expect(nav.getByRole("link", { name: section })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "View store" }).first().click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("the admin sections are reachable on a phone", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");

    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Orders" }).click();

    await expect(page).toHaveURL(/\/admin\/orders$/);
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  });

  test("every new admin endpoint refuses visitors and customers", async ({ api, account }) => {
    const paths = [
      ["GET", "/admin/stats"],
      ["GET", "/admin/customers"],
      ["POST", "/admin/customers/1/deactivate"],
      ["GET", "/admin/reviews"],
      ["POST", "/admin/reviews/1/hide"],
      ["POST", "/admin/orders/LK-ABCD2345/ship"],
      ["POST", "/admin/orders/LK-ABCD2345/refund"],
      ["PUT", "/admin/products/1/stock"],
    ] as const;
    for (const [method, path] of paths) {
      const visitor = await api.fetch(`${API_URL}/api/v1${path}`, { method, data: {} });
      const customer = await api.fetch(`${API_URL}/api/v1${path}`, {
        method,
        data: {},
        headers: { Authorization: `Bearer ${account.token}` },
      });
      expect([method + path, visitor.status(), customer.status()]).toEqual([method + path, 401, 403]);
    }
  });
});

test.describe("fulfilment", () => {
  test("an order goes from paid to delivered while the customer follows along, then reviews it", async ({ newProduct,
    adminPage: page,
    shopperPage: shopper,
    browser,
    api,
    account,
  }) => {
    const product = await newProduct();
    const number = await placePaidOrder(api, account, product.id);

    // --- the administrator ships it ---------------------------------------------------------------
    await page.goto(`/admin/orders?status=paid&q=${number}`);
    await page.getByRole("link", { name: number }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as delivered" })).toHaveCount(0);

    await page.getByRole("button", { name: "Mark as shipped" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark as shipped" });
    await dialog.getByRole("button", { name: "Mark as shipped" }).click();
    await expect(dialog.getByText("Enter the carrier")).toBeVisible();
    await expect(dialog.getByText("Enter the tracking number")).toBeVisible();
    await dialog.getByLabel("Carrier").fill("DHL");
    await dialog.getByLabel("Tracking number").fill("E2E 0146 1234");
    await dialog.getByRole("button", { name: "Mark as shipped" }).click();

    const shipment = page.getByRole("region", { name: "Shipment" });
    await expect(shipment).toContainText("DHL");
    await expect(shipment).toContainText("E2E 0146 1234");
    await expect(page.getByRole("button", { name: "Mark as delivered" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as shipped" })).toHaveCount(0);

    // --- the customer sees where it is ---------------------------------------------------------------
    await shopper.goto(`/account/orders/${number}`);
    await expect(shopper.getByText("Tracking with DHL")).toBeVisible();
    await expect(shopper.getByText("E2E 0146 1234", { exact: false }).first()).toBeVisible();
    await expect(shopper.getByRole("listitem").filter({ hasText: "Shipped, current step" })).toBeVisible();
    await expect(shopper.getByRole("link", { name: /Write a review/ })).toHaveCount(0);

    // --- delivered: now they can review it -------------------------------------------------------------
    await page.getByRole("button", { name: "Mark as delivered" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mark as delivered" }).click();
    await expect(page.getByRole("button", { name: "Refund" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as delivered" })).toHaveCount(0);
    expect((await orderOf(api, account, number)).events.map((e) => e.type)).toEqual(["placed", "paid", "shipped", "delivered"]);

    await shopper.reload();
    await shopper.getByRole("link", { name: /Write a review/ }).click();
    await expect(shopper).toHaveURL(new RegExp(`/products/${product.id}/.*#reviews`));
    const form = shopper.getByRole("form", { name: "Write a review" });
    await form.getByRole("button", { name: "Post review" }).click();
    await expect(form.getByText("Choose a rating")).toBeVisible();
    await form.locator("label", { hasText: "4 stars" }).click();
    await form.getByLabel("Headline (optional)").fill("Fits well");
    await form.getByLabel("Your review (optional)").fill("Soft cotton and true to size.");
    await form.getByRole("button", { name: "Post review" }).click();
    await expect(shopper.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(shopper.getByRole("form", { name: "Write a review" })).toHaveCount(0);

    // --- a visitor sees it, with the rating in the page's structured data ------------------------------
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/products/${product.id}`);
    const reviews = visitor.getByRole("region", { name: "Customer reviews" });
    await expect(reviews.getByRole("heading", { name: "Fits well" })).toBeVisible();
    await expect(reviews.getByText("Soft cotton and true to size.")).toBeVisible();
    await expect(reviews.getByText("4.0")).toBeVisible();
    await expect(reviews.getByRole("link", { name: "Sign in" })).toBeVisible();

    // --- the administrator hides it: gone from the page and the rating; publishing brings it back ------
    await page.goto(`/admin/reviews?q=${encodeURIComponent(product.name)}`);
    await page.getByRole("button", { name: /Hide the review by/ }).click();
    await expect(page.getByRole("button", { name: /Publish the review by/ })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText("Soft cotton and true to size.")).toHaveCount(0);
    await expect(visitor.getByText(/No reviews yet/)).toBeVisible();

    await page.getByRole("button", { name: /Publish the review by/ }).click();
    await expect(page.getByRole("button", { name: /Hide the review by/ })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText("Soft cotton and true to size.")).toBeVisible();

    // The author can change their mind.
    await shopper.reload();
    await shopper.getByRole("button", { name: "Edit" }).click();
    const edit = shopper.getByRole("form", { name: "Edit your review" });
    await edit.locator("label", { hasText: "5 stars" }).click();
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(shopper.getByRole("img", { name: "5 out of 5 stars" }).first()).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("region", { name: "Customer reviews" }).getByText("5.0")).toBeVisible();
  });

  test("a reviewed product shows its rating on the card, the page and in structured data", async ({ newProduct, browser, api, account }) => {
    const product = await newProduct();
    await placePaidOrder(api, account, product.id);
    const posted = await api.post(`${API_URL}/api/v1/products/${product.id}/reviews`, {
      headers: { Authorization: `Bearer ${account.token}` },
      data: { rating: 4, title: "Good", body: "Does the job." },
    });
    expect(posted.status()).toBe(201);

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/products?q=${encodeURIComponent(product.name)}`);
    const card = visitor.getByRole("article").filter({ hasText: product.name });
    await expect(card.getByRole("img", { name: "4 out of 5 stars" })).toBeVisible();
    await expect(card).toContainText("(1)");

    await visitor.goto(`/products/${product.id}`);
    await expect(visitor.getByRole("link", { name: /4\.0 · 1 review/ })).toBeVisible();
    const ld = (await visitor.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(ld).toContain('"aggregateRating"');
    expect(ld).toContain('"reviewCount":1');
    expect(ld).toContain('"ratingValue":4');
  });

  test("only someone who bought it can review a product", async ({ newProduct, shopperPage: shopper, api }) => {
    const product = await newProduct();

    await shopper.goto(`/products/${product.id}`);
    await expect(shopper.getByText("Only customers who have bought this product can review it.")).toBeVisible();
    await expect(shopper.getByRole("form", { name: "Write a review" })).toHaveCount(0);

    const customer = await registerAccount(api);
    const response = await api.post(`${API_URL}/api/v1/products/${product.id}/reviews`, {
      headers: { Authorization: `Bearer ${customer.token}` },
      data: { rating: 5 },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).type).toBe("urn:angel:problem:review-not-allowed");
  });

  test("refunding puts the stock back and tells the customer, and an unpaid order can be cancelled", async ({ newProduct,
    adminPage: page,
    shopperPage: shopper,
    api,
    account,
  }) => {
    const admin = await adminSession(api);
    const product = await newProduct({ stock: 20 });
    const paid = await placePaidOrder(api, account, product.id);
    expect(await stockOf(api, admin, product.id)).toBe(19);

    // --- refund ---------------------------------------------------------------------------------------
    await page.goto(`/admin/orders/${paid}`);
    await page.getByRole("button", { name: "Refund" }).click();
    const refund = page.getByRole("dialog", { name: "Refund this order?" });
    await expect(refund.getByRole("checkbox", { name: "Put the items back in stock" })).toBeChecked();
    await refund.getByRole("button", { name: "Refund order" }).click();
    await expect(refund.getByText("Say why it is being refunded")).toBeVisible();
    await refund.getByLabel("Reason").fill("Customer changed their mind");
    await refund.getByRole("button", { name: "Refund order" }).click();

    await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0);
    await expect(page.getByText("refunded via offline")).toBeVisible();
    const history = page.getByRole("region", { name: "History" });
    await expect(history).toContainText("Refunded");
    await expect(history).toContainText("Customer changed their mind");
    await expect(history).toContainText("Items returned to stock");
    expect(await stockOf(api, admin, product.id)).toBe(20);
    expect((await orderOf(api, account, paid)).status).toBe("refunded");
    await shopper.goto(`/account/orders/${paid}`);
    await expect(shopper.getByRole("listitem").filter({ hasText: "Refunded" }).first()).toBeVisible();
    // The customer never sees the administrator's reason or who did it.
    await expect(shopper.getByText("Customer changed their mind")).toHaveCount(0);

    // --- cancel an unpaid order ---------------------------------------------------------------------------
    const unpaid = await placePendingOrder(api, account, product.id);
    expect(await stockOf(api, admin, product.id)).toBe(19);
    await page.goto(`/admin/orders/${unpaid}`);
    await expect(page.getByRole("button", { name: "Mark as shipped" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel order" }).click();
    const cancel = page.getByRole("dialog", { name: "Cancel this order?" });
    await cancel.getByLabel("Note (optional)").fill("Customer called to cancel");
    await cancel.getByRole("button", { name: "Cancel order" }).click();

    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "History" })).toContainText("Customer called to cancel");
    expect(await stockOf(api, admin, product.id)).toBe(20);
    expect((await orderOf(api, account, unpaid)).status).toBe("cancelled");
  });

  test("notes are for the administrators only", async ({ newProduct, adminPage: page, shopperPage: shopper, api, account }) => {
    const product = await newProduct();
    const number = await placePaidOrder(api, account, product.id);

    await page.goto(`/admin/orders/${number}`);
    await page.getByLabel("Add a note").fill("Wrap it as a gift");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByRole("region", { name: "History" })).toContainText("Wrap it as a gift");

    await shopper.goto(`/account/orders/${number}`);
    await expect(shopper.getByRole("list", { name: "Order history" })).toBeVisible();
    await expect(shopper.getByText("Wrap it as a gift")).toHaveCount(0);
  });
});

test.describe("running the shop", () => {
  test("the dashboard shows what is waiting, and the period can be changed", async ({ newProduct, adminPage: page, api, account }) => {
    const product = await newProduct();
    await placePaidOrder(api, account, product.id);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    const figures = page.getByLabel(/Key figures for the last 30 days/);
    await expect(figures).toContainText("Revenue");
    // Against the period before: on a new shop there is none to compare with.
    await expect(figures).toContainText(/vs previous 30 days|nothing in the period before|No sales in either period/);
    await expect(page.getByRole("img", { name: /Daily revenue over the last 30 days/ })).toBeVisible();
    const attention = page.getByRole("region", { name: "Needs attention" });
    await attention.getByRole("link", { name: /waiting to ship/ }).click();
    await expect(page).toHaveURL(/\/admin\/orders\?status=paid$/);
    await expect(page.getByRole("navigation", { name: "Order status" }).getByRole("link", { name: /^To ship/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "7 days" }).click();
    await expect(page).toHaveURL(/\/admin\?days=7$/);
    await expect(page.getByRole("img", { name: /Daily revenue over the last 7 days/ })).toBeVisible();
    await page.getByText("Show the figures as a table").click();
    await expect(page.getByRole("table", { name: /Revenue and orders for each day/ }).getByRole("row")).toHaveCount(8);
  });

  test("an administrator finds a customer, suspends them and reinstates them", async ({ adminPage: page, api }) => {
    const customer = await registerAccount(api, "suspend");

    await page.goto(`/admin/customers?q=${encodeURIComponent(customer.email)}`);
    await page.getByRole("link", { name: "E2E Shopper" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Shopper" })).toBeVisible();
    await page.getByRole("button", { name: "Suspend account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspend account" }).click();
    await expect(page.getByRole("button", { name: "Reinstate account" })).toBeVisible();

    const refused = await api.post(`${API_URL}/api/v1/auth/login`, { data: { email: customer.email, password: PASSWORD } });
    expect(refused.status()).toBe(401);
    expect((await api.get(`${API_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${customer.token}` } })).status()).toBe(401);

    await page.getByRole("button", { name: "Reinstate account" }).click();
    await expect(page.getByRole("button", { name: "Suspend account" })).toBeVisible();
    const allowed = await api.post(`${API_URL}/api/v1/auth/login`, { data: { email: customer.email, password: PASSWORD } });
    expect(allowed.status()).toBe(200);
  });

  test("an administrator sets the stock of a product", async ({ newProduct, adminPage: page, api }) => {
    const admin = await adminSession(api);
    const product = await newProduct({ stock: 20 });

    await page.goto(`/admin/inventory?q=${encodeURIComponent(product.name)}`);
    const units = page.getByLabel(`Units in stock of ${product.name}`);
    await expect(units).toHaveValue("20");
    await units.fill("3");
    await page.getByRole("form", { name: `Stock of ${product.name}` }).getByRole("button", { name: "Save" }).click();
    await expect.poll(() => stockOf(api, admin, product.id)).toBe(3);

    await page.getByRole("navigation", { name: "Stock level" }).getByRole("link", { name: "Low stock" }).click();
    await expect(page.getByLabel(`Units in stock of ${product.name}`)).toHaveValue("3");

    await page.getByLabel(`Units in stock of ${product.name}`).fill("0");
    await page.getByRole("form", { name: `Stock of ${product.name}` }).getByRole("button", { name: "Save" }).click();
    await expect.poll(() => stockOf(api, admin, product.id)).toBe(0);
    const storefront = await (await api.get(`${API_URL}/api/v1/products/${product.id}`)).json();
    expect(storefront.in_stock).toBe(false);

    await page.getByRole("navigation", { name: "Stock level" }).getByRole("link", { name: "Sold out" }).click();
    await expect(page.getByRole("table").getByText("Sold out")).toBeVisible();
  });
});
