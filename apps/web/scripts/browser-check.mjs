// Drives the real app (web on :3000, API on :8000) in headless Chromium: takes the review screenshots
// and exercises the visual-search flows end to end (upload, HEIC, paste, camera, override, refine).
//   node scripts/browser-check.mjs [outDir]        (needs `make api` and `make web` running)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8000";
const out = path.resolve(process.argv[2] ?? "../../docs/screenshots");
const fixtures = path.join(process.env.FIXTURE_DIR ?? tmpdir(), "lookalike-fixtures");
mkdirSync(out, { recursive: true });
mkdirSync(fixtures, { recursive: true });

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

async function fixture(name, url) {
  const file = path.join(fixtures, name);
  if (!existsSync(file)) writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return file;
}

// A catalogue product and its photo: searching with it must return that very product first.
const product = await (await fetch(`${API}/api/v1/products/41885`)).json();
const photoWebp = await fixture("product.webp", product.image.thumb_800);
const photoJpg = path.join(fixtures, "product.jpg");
let heic = null;
try {
  execFileSync("sips", ["-s", "format", "jpeg", photoWebp, "--out", photoJpg], { stdio: "ignore" });
  heic = path.join(fixtures, "product.heic");
  execFileSync("sips", ["-s", "format", "heic", photoJpg, "--out", heic], { stdio: "ignore" });
} catch {
  console.log("SKIP  HEIC fixture (sips not available)");
}

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

async function open(kind, scheme = "light") {
  const context = await browser.newContext({ ...VIEWPORTS[kind], colorScheme: scheme, permissions: ["camera"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors };
}

async function shot(page, name, opts = {}) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // dev-only badge
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
}

const resultsHeading = (page) => page.getByRole("status").filter({ hasText: /similar item/ });

for (const kind of ["mobile", "desktop"]) {
  for (const scheme of kind === "mobile" ? ["light", "dark"] : ["light", "dark"]) {
    const { context, page, errors } = await open(kind, scheme);
    const tag = `${kind}-${scheme}`;

    await page.goto(WEB);
    await shot(page, `${tag}-home`);
    await page.getByText("New arrivals").first().scrollIntoViewIfNeeded();
    await shot(page, `${tag}-home-lower`);

    await page.goto(`${WEB}/products?gender=Women&color=Blue&sort=price_asc`);
    await shot(page, `${tag}-listing`);
    const cards = await page.locator("article").count();
    check(`${tag}: listing renders products`, cards > 0, `${cards} cards`);

    await page.goto(`${WEB}/products/${product.id}/${product.slug}`);
    await shot(page, `${tag}-product`);
    await shot(page, `${tag}-product-full`, { fullPage: true });
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = ld.flatMap((t) => [JSON.parse(t)].flat()).map((d) => d["@type"]);
    check(`${tag}: product JSON-LD`, types.includes("Product") && types.includes("BreadcrumbList"), types.join(","));

    if (scheme === "light") {
      await page.goto(`${WEB}/search`);
      await shot(page, `${tag}-search-idle`);
    }
    check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await context.close();
  }
}

// ---- mobile: filter sheet and URL sync
{
  const { context, page } = await open("mobile");
  await page.goto(`${WEB}/products?gender=Men`);
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Blue", exact: true }).click();
  await page.waitForURL(/color=Blue/);
  check("mobile: filter sheet updates the URL", page.url().includes("color=Blue"));
  await shot(page, "mobile-light-filters");
  await context.close();
}

// ---- desktop: URL-synced filters, sort and pagination
{
  const { context, page } = await open("desktop");
  await page.goto(`${WEB}/products`);
  await page.getByLabel("Men", { exact: true }).first().click();
  await page.waitForURL(/gender=Men/);
  await page.getByRole("combobox", { name: "Sort by" }).click();
  await page.getByRole("option", { name: "Price: low to high" }).click();
  await page.waitForURL(/sort=price_asc/);
  await page.getByRole("link", { name: "Page 2" }).click();
  await page.waitForURL(/page=2/);
  const url = new URL(page.url());
  check("desktop: filters, sort and page live in the URL", url.searchParams.get("gender") === "Men" && url.searchParams.get("sort") === "price_asc" && url.searchParams.get("page") === "2", url.search);
  await context.close();
}

// ---- search flows (desktop)
{
  const { context, page, errors } = await open("desktop");
  // Playwright can't read multipart bodies that contain a Blob, so record the FormData in the page.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.__searches = [];
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/v1/search/") && init?.body instanceof FormData) {
        const fields = [...init.body.entries()].map(([k, v]) => (v instanceof File ? `${k}=<file ${v.name} ${v.type}>` : `${k}=${v}`));
        window.__searches.push({ url, fields });
      }
      return original(input, init);
    };
  });
  const searches = () => page.evaluate(() => window.__searches);
  const reset = () => page.evaluate(() => (window.__searches = []));

  await page.goto(`${WEB}/search`);
  await page.locator('input[aria-label="Choose a photo"]').setInputFiles(photoJpg);
  await resultsHeading(page).waitFor();
  await page.locator("article").first().waitFor();
  await shot(page, "desktop-light-search-results");
  const first = await page.locator("article a").first().getAttribute("href");
  check("search: the product's own photo ranks first", first?.startsWith(`/products/${product.id}/`), first ?? "");
  check("search: similarity badge shown", (await page.getByText(/\d+% match/).count()) > 0);
  const detected = page.getByRole("button", { name: /Detected:/ });
  check("search: detected category chip shown", await detected.isVisible(), await detected.innerText().catch(() => ""));

  // override the category
  await reset();
  await detected.click();
  await page.getByRole("combobox").or(page.locator("select")).last().selectOption("Tshirts");
  await resultsHeading(page).waitFor();
  await page.waitForResponse((r) => r.url().includes("/api/v1/search/image"));
  const afterOverride = await searches();
  check("search: override sends article_type", afterOverride.some((r) => r.fields.includes("article_type=Tshirts")), JSON.stringify(afterOverride.map((r) => r.fields)));
  await shot(page, "desktop-light-search-override");

  // refine with words (hybrid)
  await reset();
  await page.getByLabel("Refine with words").fill("in red");
  await page.getByRole("button", { name: "Refine" }).click();
  await page.waitForResponse((r) => r.url().includes("/api/v1/search/hybrid"));
  check("search: refinement uses hybrid search", (await searches()).some((r) => r.url.endsWith("/search/hybrid") && r.fields.includes("query=in red")));
  await shot(page, "desktop-light-search-refined");

  // filter chip
  await reset();
  await page.getByRole("button", { name: "Women", exact: true }).click();
  await page.waitForResponse((r) => r.url().includes("/api/v1/search/hybrid"));
  check("search: filter chip refines the search", (await searches()).some((r) => r.fields.includes("gender=Women")));

  // paste (wait for hydration first: the listener is attached by React)
  await page.goto(`${WEB}/search`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "pasted.jpg", { type: "image/jpeg" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, (await import("node:fs")).readFileSync(photoJpg).toString("base64"));
  await resultsHeading(page).waitFor();
  check("search: pasting an image starts a search", (await page.locator("article").count()) > 0);

  // drag and drop
  await page.goto(`${WEB}/search`);
  await page.waitForLoadState("networkidle");
  const dataTransfer = await page.evaluateHandle(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "dropped.jpg", { type: "image/jpeg" }));
    return dt;
  }, (await import("node:fs")).readFileSync(photoJpg).toString("base64"));
  await page.getByText("Drop a photo here").dispatchEvent("drop", { dataTransfer });
  await resultsHeading(page).waitFor();
  check("search: dropping an image starts a search", (await page.locator("article").count()) > 0);

  // camera (fake device)
  await page.goto(`${WEB}/search`);
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await page.getByRole("button", { name: "Capture" }).waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("button[disabled]")?.textContent?.includes("Capture"));
  await shot(page, "desktop-light-search-camera");
  await page.getByRole("button", { name: "Capture" }).click();
  await resultsHeading(page).waitFor();
  check("search: camera capture starts a search", (await page.locator("article").count()) > 0);

  // wrong file type
  await page.goto(`${WEB}/search`);
  writeFileSync(path.join(fixtures, "notes.txt"), "hello");
  await page.locator('input[aria-label="Choose a photo"]').setInputFiles(path.join(fixtures, "notes.txt"));
  check("search: a non-image is rejected with a message", await page.getByRole("alert").filter({ hasText: /isn't an image/ }).isVisible());

  // HEIC → JPEG in the browser
  if (heic) {
    await page.goto(`${WEB}/search`);
    await reset();
    await page.locator('input[aria-label="Choose a photo"]').setInputFiles(heic);
    await resultsHeading(page).waitFor({ timeout: 30_000 });
    check("search: HEIC photo is converted and searched", (await page.locator("article").count()) > 0 && (await searches()).some((r) => r.fields.includes("file=<file photo.jpg image/jpeg>")), JSON.stringify((await searches())[0]?.fields));
  }
  check("search flows: no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
}

// ---- mobile search results
{
  const { context, page } = await open("mobile");
  await page.goto(`${WEB}/search`);
  await page.locator('input[aria-label="Choose a photo"]').setInputFiles(photoJpg);
  await resultsHeading(page).waitFor();
  await page.locator("article").first().waitFor();
  await shot(page, "mobile-light-search-results");
  await shot(page, "mobile-light-search-results-full", { fullPage: true });
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
