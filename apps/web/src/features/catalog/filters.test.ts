import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  emptyFilters,
  parseListingQuery,
  toApiFilters,
  toHref,
  toSearchParams,
  toggleValue,
} from "./filters";

describe("parseListingQuery", () => {
  it("returns defaults for an empty URL", () => {
    const q = parseListingQuery({});
    expect(q).toMatchObject({ gender: [], color: [], in_stock: false, page: 1 });
    expect(q.q).toBeUndefined();
    expect(q.sort).toBeUndefined();
  });

  it("accepts single and repeated values", () => {
    const q = parseListingQuery({ gender: ["Men", "Unisex"], color: "Blue" });
    expect(q.gender).toEqual(["Men", "Unisex"]);
    expect(q.color).toEqual(["Blue"]);
  });

  it("drops blanks and duplicates and caps values at 12 per key", () => {
    const many = Array.from({ length: 20 }, (_, i) => `c${i}`);
    expect(parseListingQuery({ color: ["", " Blue ", "Blue"] }).color).toEqual(["Blue"]);
    expect(parseListingQuery({ color: many }).color).toHaveLength(12);
  });

  it("ignores malformed numbers, sorts and pages instead of throwing", () => {
    const q = parseListingQuery({ min_price: "abc", max_price: "-5", sort: "cheapest", page: "0" });
    expect(q.min_price).toBeUndefined();
    expect(q.max_price).toBeUndefined();
    expect(q.sort).toBeUndefined();
    expect(q.page).toBe(1);
    expect(parseListingQuery({ page: "2.5" }).page).toBe(1);
    expect(parseListingQuery({ page: "99999" }).page).toBe(1);
  });

  it("drops `relevance` without a text query (the API would answer 422)", () => {
    expect(parseListingQuery({ sort: "relevance" }).sort).toBeUndefined();
    expect(parseListingQuery({ sort: "relevance", q: "red" }).sort).toBe("relevance");
  });

  it("swaps a reversed price range", () => {
    const q = parseListingQuery({ min_price: "5000", max_price: "1000" });
    expect([q.min_price, q.max_price]).toEqual([1000, 5000]);
  });

  it("trims and limits the text query", () => {
    expect(parseListingQuery({ q: "  red shirt  " }).q).toBe("red shirt");
    expect(parseListingQuery({ q: "x".repeat(300) }).q).toHaveLength(200);
    expect(parseListingQuery({ q: "   " }).q).toBeUndefined();
  });

  it("only treats the literal `true` as in-stock", () => {
    expect(parseListingQuery({ in_stock: "true" }).in_stock).toBe(true);
    expect(parseListingQuery({ in_stock: "1" }).in_stock).toBe(false);
  });
});

describe("toSearchParams / toHref", () => {
  it("omits defaults so URLs stay short", () => {
    expect(toHref("/products", parseListingQuery({}))).toBe("/products");
  });

  it("round-trips a full query", () => {
    const original = parseListingQuery({
      gender: ["Men", "Unisex"],
      article_type: "Shirts",
      color: "Blue",
      min_price: "1000",
      max_price: "5000",
      in_stock: "true",
      q: "linen",
      sort: "price_asc",
      page: "3",
    });
    const href = toHref("/products", original);
    const reparsed = parseListingQuery(Object.fromEntries(new URL(href, "http://x").searchParams.entries()));
    // Object.fromEntries keeps only the last repeated value, so compare via the serialized form.
    expect(toSearchParams(reparsed).get("sort")).toBe("price_asc");
    expect(href).toContain("gender=Men&gender=Unisex");
    expect(href).toContain("page=3");
  });

  it("escapes values", () => {
    expect(toSearchParams({ q: "a&b" }).toString()).toBe("q=a%26b");
  });
});

describe("filter helpers", () => {
  it("toggles a value on and off without mutating", () => {
    const f = emptyFilters();
    const on = toggleValue(f, "color", "Blue");
    expect(on.color).toEqual(["Blue"]);
    expect(f.color).toEqual([]);
    expect(toggleValue(on, "color", "Blue").color).toEqual([]);
  });

  it("counts active filters, treating a price range as one", () => {
    const f = { ...emptyFilters(), gender: ["Men", "Women"], min_price: 100, max_price: 900, in_stock: true };
    expect(activeFilterCount(f)).toBe(4);
  });

  it("maps to API fields and leaves in_stock out when false", () => {
    expect(toApiFilters(emptyFilters()).in_stock).toBeUndefined();
    expect(toApiFilters({ ...emptyFilters(), in_stock: true }).in_stock).toBe(true);
  });
});
