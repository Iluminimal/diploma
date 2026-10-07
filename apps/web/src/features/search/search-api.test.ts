import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyFilters } from "@/features/catalog/filters";
import { ApiError } from "@/lib/api/errors";
import { makeSearchResponse } from "@/test/fixtures";
import { buildSearchForm, searchByImage } from "./search-api";

const photo = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });
const base = { filters: emptyFilters(), articleType: null, refinement: "" };

afterEach(() => vi.unstubAllGlobals());

describe("buildSearchForm", () => {
  it("sends the file, the limit and nothing else by default", () => {
    const form = buildSearchForm(photo, base);
    expect([...form.keys()].sort()).toEqual(["file", "limit"]);
    expect(form.get("limit")).toBe("24");
  });

  it("repeats multi-value filters and sends prices in cents", () => {
    const form = buildSearchForm(photo, {
      ...base,
      filters: { ...emptyFilters(), gender: ["Men", "Unisex"], color: ["Blue"], min_price: 1000, max_price: 5000, in_stock: true },
    });
    expect(form.getAll("gender")).toEqual(["Men", "Unisex"]);
    expect(form.get("color")).toBe("Blue");
    expect(form.get("min_price")).toBe("1000");
    expect(form.get("max_price")).toBe("5000");
    expect(form.get("in_stock")).toBe("true");
  });

  it("applies the user's chosen category and the refinement text", () => {
    const form = buildSearchForm(photo, { ...base, articleType: "Shirts", refinement: "  in blue " });
    expect(form.getAll("article_type")).toEqual(["Shirts"]);
    expect(form.get("query")).toBe("in blue");
  });
});

describe("searchByImage", () => {
  it("posts to the image endpoint without a refinement", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeSearchResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchByImage(photo, base);
    expect(result.results).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/search\/image$/);
    expect(init.method).toBe("POST");
  });

  it("switches to hybrid search when there is a refinement", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeSearchResponse()));
    vi.stubGlobal("fetch", fetchMock);
    await searchByImage(photo, { ...base, refinement: "in red" });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toMatch(/\/search\/hybrid$/);
  });

  it("turns problem responses into ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ title: "Too large", status: 413 }, { status: 413 })),
    );
    await expect(searchByImage(photo, base)).rejects.toMatchObject({ status: 413 });
  });

  it("reports an unreachable API as a status 0 error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const error = await searchByImage(photo, base).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });
});
