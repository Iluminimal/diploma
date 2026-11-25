import { describe, expect, it } from "vitest";
import {
  parseCustomerParams,
  parseOrderParams,
  parseAuditParams,
  parsePeriod,
  parseProductParams,
  parseReviewParams,
  toQuery,
} from "./list-params";

describe("list params", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseProductParams({})).toEqual({ q: "", status: "all", stock: "all", sort: "newest", page: 1 });
    expect(parseProductParams({ status: "bogus", stock: "lots", sort: "x", page: "-3" })).toEqual({
      q: "",
      status: "all",
      stock: "all",
      sort: "newest",
      page: 1,
    });
    expect(parseOrderParams({ status: "lost", page: "1.5" })).toEqual({ q: "", status: "all", page: 1 });
  });

  it("reads valid values, trimming and bounding the search text", () => {
    expect(
      parseProductParams({ q: "  shirt ", status: "inactive", stock: "low", sort: "price_desc", page: "4" }),
    ).toEqual({ q: "shirt", status: "inactive", stock: "low", sort: "price_desc", page: 4 });
    expect(parseOrderParams({ status: "refunded" }).status).toBe("refunded");
    expect(parseOrderParams({ q: "x".repeat(500) }).q).toHaveLength(200);
    expect(parseProductParams({ page: ["2", "3"] }).page).toBe(2);
    expect(parseProductParams({ page: "10001" }).page).toBe(1);
  });

  it("reads the customer, review and period parameters", () => {
    expect(parseCustomerParams({})).toEqual({ q: "", status: "all", sort: "newest", page: 1 });
    expect(parseCustomerParams({ q: " ada ", status: "inactive", sort: "spent", page: "2" })).toEqual({
      q: "ada",
      status: "inactive",
      sort: "spent",
      page: 2,
    });
    expect(parseCustomerParams({ status: "x", sort: "y" })).toMatchObject({ status: "all", sort: "newest" });
    expect(parseReviewParams({ status: "hidden", rating: "2" })).toEqual({ q: "", status: "hidden", rating: 2, page: 1 });
    expect(parseReviewParams({ rating: "9" }).rating).toBe(0);
    expect(parseReviewParams({ rating: "2.5" }).rating).toBe(0);
    expect(parsePeriod({})).toEqual({ days: 30 });
    expect(parsePeriod({ days: "7" })).toEqual({ days: 7 });
    expect(parsePeriod({ days: "90" })).toEqual({ days: 90 });
    expect(parsePeriod({ days: "365" })).toEqual({ days: 365 });
    expect(parsePeriod({ days: "1000" })).toEqual({ days: 30 });
    expect(parsePeriod({ days: "x" })).toEqual({ days: 30 });
  });

  it("reads a custom period only when it is whole, ordered, past and at most a year", () => {
    const now = new Date("2026-11-25T10:00:00Z");
    expect(parsePeriod({ start: "2026-11-01", end: "2026-11-25" }, now)).toEqual({
      days: 25,
      start: "2026-11-01",
      end: "2026-11-25",
    });
    expect(parsePeriod({ start: "2026-11-25", end: "2026-11-25" }, now).days).toBe(1);
    for (const bad of [
      { start: "2026-11-01" },
      { end: "2026-11-25" },
      { start: "2026-11-25", end: "2026-11-01" },
      { start: "2026-11-01", end: "2026-11-26" },
      { start: "2025-01-01", end: "2026-11-25" },
      { start: "2026-02-30", end: "2026-11-25" },
      { start: "yesterday", end: "today" },
    ]) {
      expect(parsePeriod({ ...bad, days: "7" }, now)).toEqual({ days: 7 });
    }
  });

  it("reads the audit log filters", () => {
    expect(parseAuditParams({})).toEqual({ entity: "all", actor: 0, action: "", page: 1 });
    expect(parseAuditParams({ entity: "order", actor: "5", action: "order.ship", page: "3" })).toEqual({
      entity: "order",
      actor: 5,
      action: "order.ship",
      page: 3,
    });
    expect(parseAuditParams({ entity: "user", actor: "-1", action: "x; drop" })).toEqual({
      entity: "all",
      actor: 0,
      action: "",
      page: 1,
    });
  });

  it("leaves defaults out of the query string", () => {
    const defaults = { q: "", status: "all", page: 1 };
    expect(toQuery({ q: "", status: "all", page: 1 }, defaults)).toBe("");
    expect(toQuery({ q: "a b", status: "paid", page: 2 }, defaults)).toBe("?q=a+b&status=paid&page=2");
  });
});
