// Drives the commerce flows in headless Chromium at phone and desktop widths and takes review
// screenshots: guest cart, sign-up with cart merge, wishlist, demo checkout, orders, addresses,
// sign-out and sign-in again.
//   node scripts/commerce-check.mjs [outDir]    (needs the API with PAYMENTS_MODE=offline and the web app)
// WEB_URL / API_URL point it at another stack (the API must allow WEB_URL as a CORS origin).
import path from "node:path";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8000";
const out = path.resolve(process.argv[2] ?? "../../docs/screenshots");
mkdirSync(out, { recursive: true });

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  return ok;
}

// An in-stock apparel product (it has sizes).
const listing = await (await fetch(`${API}/api/v1/products?in_stock=true&master_category=Apparel&page_size=1`)).json();
const product = listing.items[0];
const productUrl = `${WEB}/products/${product.id}/${product.slug}`;
const money = (cents) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

const browser = await chromium.launch();
const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

async function open(kind) {
  const context = await browser.newContext({ ...VIEWPORTS[kind], colorScheme: "light" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors };
}

async function shot(page, name, opts = {}) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // dev-only badge
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: "jpeg", quality: 82, ...opts });
}

// A CSS selector, not a role query: while the drawer is open the rest of the page is aria-hidden.
const cartButton = (page) => page.locator('button[aria-label^="Cart"]');
async function badge(page) {
  const label = (await cartButton(page).getAttribute("aria-label")) ?? "";
  return Number(/(\d+) item/.exec(label)?.[1] ?? 0);
}

async function flow(kind) {
  const { context, page, errors } = await open(kind);
  const tag = `${kind}-commerce`;
  const email = `check-${kind}-${Date.now()}@example.com`;
  const password = "correct horse battery";
  const orderNumbers = [];

  try {
    // --- 1. A guest adds to the cart -------------------------------------------------------
    await page.goto(productUrl);
    await shot(page, `${tag}-01-product`);
    await page.getByRole("button", { name: /add to cart/i }).click();
    check(`${kind}: add to cart without a size asks for one`, await page.getByText("Please select a size.").isVisible());
    await page.locator("label", { hasText: /^M$/ }).click();
    await page.getByRole("button", { name: /add to cart/i }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByText(product.name).waitFor();
    check(`${kind}: the mini-cart drawer opens with the product and size`, await drawer.getByText(/Size M/).isVisible());
    await shot(page, `${tag}-02-drawer`);
    check(`${kind}: header badge counts the item`, (await badge(page)) === 1);

    // --- 2. Cart page: quantity stepper and stock limit ------------------------------------
    await drawer.getByRole("link", { name: "View cart" }).click();
    await page.waitForURL("**/cart");
    const increase = page.locator("main").getByRole("button", { name: `Increase quantity of ${product.name}` });
    await increase.click();
    await page.getByText(`Subtotal (2 items)`).waitFor();
    check(`${kind}: quantity change updates the subtotal`, await page.getByText(money(product.price_cents * 2)).first().isVisible());
    let clicks = 0;
    while ((await increase.isEnabled()) && clicks < 12) {
      await increase.click();
      clicks += 1;
      await page.waitForTimeout(120);
    }
    check(`${kind}: the stepper stops at the stock limit`, (await increase.isDisabled()) && clicks < 12, `${clicks + 2} units`);
    const decrease = page.locator("main").getByRole("button", { name: `Decrease quantity of ${product.name}` });
    for (let i = 0; i < clicks; i += 1) {
      await decrease.click();
      await page.waitForTimeout(120);
    }
    await page.getByText("Subtotal (2 items)").waitFor();
    await shot(page, `${tag}-03-cart`);

    // --- 3. A guest cannot save to the wishlist: goes to sign in and comes back ----------------
    await page.goto(productUrl);
    await page.getByRole("button", { name: /save .* to your wishlist/i }).first().click(); // the product's own, before the similar cards
    await page.waitForURL(/\/login\?next=/);
    check(`${kind}: wishlist asks a guest to sign in and remembers the product page`, page.url().includes(encodeURIComponent(`/products/${product.id}`)));
    await shot(page, `${tag}-04-login`);

    // --- 4. Register: back on the product, guest cart merged ---------------------------------
    await page.getByRole("link", { name: "Create an account" }).click();
    await page.getByLabel("Full name").fill(`Check ${kind}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    check(`${kind}: a short password is rejected before any request`, await page.getByText("Use at least 10 characters").isVisible());
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(productUrl);
    await page.getByRole("button", { name: /^Account: / }).waitFor();
    check(`${kind}: registering signs in and returns to the product page`, true);
    await page.waitForFunction(() => /2 items/.test(document.querySelector('button[aria-label^="Cart"]')?.getAttribute("aria-label") ?? ""));
    check(`${kind}: the guest cart was merged into the account (2 items)`, (await badge(page)) === 2);

    // --- 5. Wishlist ---------------------------------------------------------------------------
    const save = page.getByRole("button", { name: /save .* to your wishlist/i }).first();
    await save.click();
    await page.getByRole("button", { name: /^Saved/ }).waitFor();
    check(`${kind}: saving to the wishlist is reflected at once`, (await page.getByRole("button", { name: /^Saved/ }).getAttribute("aria-pressed")) === "true");
    await page.goto(`${WEB}/account/wishlist`);
    await page.getByRole("heading", { name: product.name }).waitFor();
    check(`${kind}: the wishlist page lists the saved product`, true);
    await shot(page, `${tag}-05-wishlist`);

    // --- 6. Checkout: address, shipping, demo payment ------------------------------------------
    await page.goto(productUrl);
    await cartButton(page).click();
    await page.getByRole("dialog").getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL("**/checkout");
    await page.getByLabel("Full name").fill("Ada Lovelace");
    await page.getByLabel("Address", { exact: true }).fill("12 Analytical Way");
    await page.getByLabel("City").fill("Springfield");
    await page.getByLabel("Postal code").fill("12345");
    await page.getByRole("button", { name: "Use this address" }).click();
    await page.getByRole("radio", { name: /Ada Lovelace/ }).waitFor();
    check(`${kind}: a new address is saved and selected at checkout`, await page.getByRole("radio", { name: /Ada Lovelace/ }).isChecked());
    check(`${kind}: the card form says it is a demo`, await page.getByText("Demo payment, no real charge.", { exact: false }).first().isVisible());
    const payBefore = await page.getByRole("button", { name: /pay now/i }).innerText();
    await page.locator("label", { hasText: "Express shipping" }).click();
    await page.waitForTimeout(200);
    const payAfter = await page.getByRole("button", { name: /pay now/i }).innerText();
    check(`${kind}: choosing express shipping changes the total`, payBefore !== payAfter, `${payBefore.replace(/\n/g, " ")} -> ${payAfter.replace(/\n/g, " ")}`);
    await shot(page, `${tag}-06-checkout`, { fullPage: true });
    await page.getByRole("button", { name: /pay now/i }).click();
    await page.waitForURL("**/checkout/confirmation/**");
    await page.getByRole("heading", { name: "Thank you for your order" }).waitFor();
    const number = /LK-[A-Z0-9]{8}/.exec(await page.locator("main").innerText())?.[0];
    orderNumbers.push(number);
    check(`${kind}: the demo payment completes and the confirmation shows order ${number}`, Boolean(number));
    await shot(page, `${tag}-07-confirmation`, { fullPage: true });
    check(`${kind}: the cart is empty after paying`, (await badge(page)) === 0);

    // --- 7. Orders ------------------------------------------------------------------------------
    await page.goto(`${WEB}/account/orders`);
    await page.getByRole("link", { name: new RegExp(number) }).waitFor();
    await shot(page, `${tag}-08-orders`);
    await page.getByRole("link", { name: new RegExp(number) }).click();
    await page.getByRole("heading", { name: `Order ${number}` }).waitFor();
    await page.getByText("12 Analytical Way").first().waitFor();
    check(`${kind}: the order detail shows the snapshot lines and the address`, await page.getByText(product.name).first().isVisible());
    await shot(page, `${tag}-09-order-detail`, { fullPage: true });

    // --- 8. Addresses: add, make default, delete -------------------------------------------------
    await page.goto(`${WEB}/account/addresses`);
    await page.getByRole("button", { name: "Add an address" }).click();
    await page.getByLabel("Full name").fill("Ada at Work");
    await page.getByLabel("Address", { exact: true }).fill("1 Engine Road");
    await page.getByLabel("City").fill("Shelbyville");
    await page.getByLabel("Postal code").fill("54321");
    await page.getByRole("button", { name: "Save address" }).click();
    await page.getByText("1 Engine Road").waitFor();
    await page.getByRole("button", { name: "Make default" }).click();
    await page.waitForFunction(() => document.querySelectorAll("li").length > 0 && [...document.querySelectorAll("li")].some((li) => /Ada at Work/.test(li.textContent) && /Default/.test(li.textContent)));
    check(`${kind}: another address can be made the default`, true);
    await shot(page, `${tag}-10-addresses`);
    await page.getByRole("button", { name: /Delete address for Ada Lovelace/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("list", { name: "Saved addresses" }).getByText("12 Analytical Way").waitFor({ state: "detached" });
    check(`${kind}: deleting an address asks first and removes it`, true);

    // --- 9. Navigation on a phone, then sign out ------------------------------------------------------
    if (kind === "mobile") {
      await page.getByRole("button", { name: "Open menu" }).click();
      check("mobile: the menu links to the account pages", await page.getByRole("link", { name: "Wishlist" }).last().isVisible());
      await shot(page, `${tag}-11-menu`);
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: /^Account: / }).click();
    await shot(page, `${tag}-12-account-menu`);
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await page.getByRole("link", { name: "Sign in" }).first().waitFor();
    check(`${kind}: signing out shows the sign-in link`, true);
    await page.goto(`${WEB}/account/orders`);
    await page.waitForURL(/\/login\?next=%2Faccount%2Forders/);
    check(`${kind}: protected pages send a signed-out visitor to sign in`, true);

    // --- 10. Sign in again: the order is still there --------------------------------------------------
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong password!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("alert").getByText(/don't match/).waitFor();
    check(`${kind}: a wrong password gets a friendly message`, true);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/account/orders");
    await page.getByRole("link", { name: new RegExp(number) }).waitFor();
    check(`${kind}: signing in returns to the requested page with the order history`, true);

    // --- 11. A reload keeps the session (refresh cookie) -----------------------------------------------
    await page.reload();
    await page.getByRole("button", { name: /^Account: / }).waitFor();
    check(`${kind}: the session survives a reload`, true);

    const real = errors.filter((e) => !/Failed to load resource.*(401|404)/.test(e));
    check(`${kind}: no console errors during the flow`, real.length === 0, real.slice(0, 2).join(" | "));
  } catch (error) {
    check(`${kind}: flow completed`, false, String(error).split("\n")[0]);
    await page.screenshot({ path: path.join(out, `${tag}-FAILED.jpg`), type: "jpeg", quality: 70 }).catch(() => {});
  } finally {
    await context.close();
  }
}

await flow("desktop");
await flow("mobile");
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
