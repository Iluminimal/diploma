import { describe, expect, it } from "vitest";
import { catalogNav } from "@/test/fixtures";
import { categoryEntries, productEntries, robotsFor, sitemapIds, sitemapUrl, SITEMAP_CHUNK, staticEntries } from "./sitemap";

describe("sitemapIds", () => {
  it.each([
    [0, 1],
    [1, 1],
    [SITEMAP_CHUNK, 1],
    [SITEMAP_CHUNK + 1, 2],
    [41_885, 5],
  ])("%i products need %i file(s)", (total, files) => {
    expect(sitemapIds(total)).toHaveLength(files);
  });

  it("numbers the files from zero", () => {
    expect(sitemapIds(25_000)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
  });
});

describe("entries", () => {
  it("lists the home page, the catalogue and search with absolute URLs", () => {
    const urls = staticEntries().map((entry) => entry.url);

    expect(urls).toContain("http://localhost:3000/");
    expect(urls).toContain("http://localhost:3000/products");
    expect(urls).toContain("http://localhost:3000/search");
    // "New" is a sort of the whole catalogue, not a page of its own.
    expect(urls.some((url) => url.includes("sort="))).toBe(false);
    expect(urls.every((url) => url.startsWith("http://localhost:3000"))).toBe(true);
  });

  it("lists every department and category page, shallow ones first", () => {
    const entries = categoryEntries(catalogNav);
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("http://localhost:3000/c/men");
    expect(urls).toContain("http://localhost:3000/c/men/apparel/topwear/tshirts");
    expect(urls).toContain("http://localhost:3000/c/women/apparel");
    const priority = (path: string) => entries.find((e) => e.url.endsWith(path))?.priority ?? 0;
    expect(priority("/c/men")).toBeGreaterThan(priority("/c/men/apparel/topwear/tshirts"));
  });

  it("only contains URLs that are valid inside XML as they are written", () => {
    const urls = [
      ...staticEntries(),
      ...categoryEntries(catalogNav),
      ...productEntries([{ id: 1, slug: "a-b-c-1", updated_at: "2026-10-08T10:00:00Z" }]),
    ].map((entry) => entry.url);

    // Next.js does not escape what it puts in <loc>.
    for (const url of urls) expect(url).not.toMatch(/[&<>"']/);
  });

  it("gives every product its canonical URL and last-modified date", () => {
    const [entry] = productEntries([{ id: 7, slug: "linen-shirt-1a2b", updated_at: "2026-10-08T10:00:00Z" }]);

    expect(entry?.url).toBe("http://localhost:3000/products/7/linen-shirt-1a2b");
    expect(entry?.lastModified).toEqual(new Date("2026-10-08T10:00:00Z"));
  });
});

describe("robots", () => {
  const robots = robotsFor([0, 1]);
  const rules = [robots.rules].flat();

  it("points crawlers at every sitemap file", () => {
    expect(robots.sitemap).toEqual(["http://localhost:3000/sitemap/0.xml", "http://localhost:3000/sitemap/1.xml"]);
    expect(sitemapUrl(3)).toBe("http://localhost:3000/sitemap/3.xml");
  });

  it("keeps crawlers out of private and low-value pages but not the shop", () => {
    const disallow = [rules[0]?.disallow].flat();

    for (const path of ["/account", "/admin", "/cart", "/checkout", "/login", "/register", "/api/"]) {
      expect(disallow).toContain(path);
    }
    expect(disallow).toContain("/*?*q=");
    expect(disallow).toContain("/*?*page=");
    expect(rules[0]?.allow).toBe("/");
    expect(disallow).not.toContain("/");
    expect(disallow).not.toContain("/products");
  });
});
