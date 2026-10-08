// Lighthouse (mobile preset, simulated slow 4G, the default) against a running production build.
//   node scripts/lighthouse.mjs [--runs 3] [--out ../../docs/perf/lighthouse.json] [--pages home,listing]
// Reports the median run per page, so one noisy run cannot decide. The web app must be served by
// `make web-prod` (a dev server is far slower and says nothing about production) and the API must be up.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8000";
const RUNS = Number(arg("runs", 3));
const OUT = path.resolve(arg("out", "../../docs/perf/lighthouse.json"));
const ONLY = arg("pages", "")
  .split(",")
  .filter(Boolean);

const listing = await (await fetch(`${API}/api/v1/products?in_stock=true&master_category=Apparel&page_size=1`)).json();
const product = listing.items[0];
const PAGES = {
  home: "/",
  listing: "/products",
  filtered: "/products?gender=Women&sort=price_asc",
  product: `/products/${product.id}/${product.slug}`,
  search: "/search",
  cart: "/cart",
  login: "/login",
};
const names = ONLY.length ? ONLY : Object.keys(PAGES);

async function once(url) {
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });
  try {
    const { lhr } = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error" });
    const audit = (id) => lhr.audits[id]?.numericValue ?? 0;
    return {
      performance: Math.round((lhr.categories.performance.score ?? 0) * 100),
      accessibility: Math.round((lhr.categories.accessibility.score ?? 0) * 100),
      bestPractices: Math.round((lhr.categories["best-practices"].score ?? 0) * 100),
      seo: Math.round((lhr.categories.seo.score ?? 0) * 100),
      fcp: Math.round(audit("first-contentful-paint")),
      lcp: Math.round(audit("largest-contentful-paint")),
      tbt: Math.round(audit("total-blocking-time")),
      cls: Number(audit("cumulative-layout-shift").toFixed(3)),
      si: Math.round(audit("speed-index")),
      transferKb: Math.round(audit("total-byte-weight") / 1024),
      jsKb: Math.round(
        lhr.audits["network-requests"].details.items
          .filter((item) => item.resourceType === "Script")
          .reduce((sum, item) => sum + item.transferSize, 0) / 1024,
      ),
      lcpElement: lhr.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 120),
    };
  } finally {
    await chrome.kill();
  }
}

const results = {};
for (const name of names) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await once(`${WEB}${PAGES[name]}`));
  const pick = [...runs].sort((a, b) => a.performance - b.performance)[Math.floor(runs.length / 2)];
  results[name] = { url: PAGES[name], runs: runs.map((r) => r.performance), ...pick };
  const r = results[name];
  console.log(
    `${name.padEnd(9)} perf ${String(r.performance).padStart(3)} (runs ${r.runs.join("/")})  a11y ${r.accessibility}  bp ${r.bestPractices}  seo ${r.seo}` +
      `  | FCP ${r.fcp} LCP ${r.lcp} TBT ${r.tbt} CLS ${r.cls}  | JS ${r.jsKb} KB, total ${r.transferKb} KB`,
  );
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ lighthouse: "13.5.0", preset: "mobile, simulated slow 4G", runs: RUNS, measured: new Date().toISOString(), pages: results }, null, 2) + "\n",
);
console.log(`\nwritten ${OUT}`);
const failing = Object.entries(results).filter(([name, r]) => ["home", "listing", "product"].includes(name) && r.performance < 90);
process.exit(failing.length ? 1 : 0);
