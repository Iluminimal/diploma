import { describe, expect, it } from "vitest";
import { parseOrderParams, parseProductParams, toQuery } from "./list-params";

describe("list params", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseProductParams({})).toEqual({ q: "", status: "all", sort: "newest", page: 1 });
    expect(parseProductParams({ status: "bogus", sort: "x", page: "-3" })).toEqual({
      q: "",
      status: "all",
      sort: "newest",
      page: 1,
    });
    expect(parseOrderParams({ status: "refunded", page: "1.5" })).toEqual({ q: "", status: "all", page: 1 });
  });

  it("reads valid values, trimming and bounding the search text", () => {
    expect(parseProductParams({ q: "  shirt ", status: "inactive", sort: "price_desc", page: "4" })).toEqual({
      q: "shirt",
      status: "inactive",
      sort: "price_desc",
      page: 4,
    });
    expect(parseOrderParams({ q: "x".repeat(500) }).q).toHaveLength(200);
    expect(parseProductParams({ page: ["2", "3"] }).page).toBe(2);
    expect(parseProductParams({ page: "10001" }).page).toBe(1);
  });

  it("leaves defaults out of the query string", () => {
    const defaults = { q: "", status: "all", page: 1 };
    expect(toQuery({ q: "", status: "all", page: 1 }, defaults)).toBe("");
    expect(toQuery({ q: "a b", status: "paid", page: 2 }, defaults)).toBe("?q=a+b&status=paid&page=2");
  });
});
