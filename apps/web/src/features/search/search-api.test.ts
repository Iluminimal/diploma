import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyFilters } from "@/features/catalog/filters";
import { ApiError } from "@/lib/api/errors";
import { asGarmentResponse, makeGarmentResponse, makeSearchResponse } from "@/test/fixtures";
import {
  buildGarmentForm,
  buildSearchForm,
  garmentAsSearchResponse,
  searchByImage,
  searchGarments,
  searchSimilarWithText,
} from "./search-api";

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
    expect(form.get("interpret")).toBe("true");
  });

  it("sends the chosen garment only when it is not the default one", () => {
    expect(buildSearchForm(photo, { ...base, region: 0 }).has("region")).toBe(false);
    expect(buildSearchForm(photo, { ...base, region: 2 }).get("region")).toBe("2");
  });

  it("does not ask for interpretation without a refinement", () => {
    expect(buildSearchForm(photo, base).has("interpret")).toBe(false);
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

describe("searchSimilarWithText", () => {
  it("asks the similar endpoint to blend the text in and read filters out of it", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeSearchResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await searchSimilarWithText(7, "  цэнхэр  ", 12);

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v1/products/7/similar");
    expect(parsed.searchParams.get("query")).toBe("цэнхэр");
    expect(parsed.searchParams.get("interpret")).toBe("true");
    expect(parsed.searchParams.get("limit")).toBe("12");
  });

  it("turns problem responses into ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ title: "Product not found", status: 404 }, { status: 404 })),
    );
    await expect(searchSimilarWithText(7, "red")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("garment search", () => {
  it("sends the file, the filters and a small per-garment limit", () => {
    const form = buildGarmentForm(photo, { filters: { ...emptyFilters(), gender: ["Men"], in_stock: true } });
    expect([...form.keys()].sort()).toEqual(["file", "gender", "in_stock", "limit"]);
    expect(form.get("limit")).toBe("6");
    expect(form.getAll("gender")).toEqual(["Men"]);
    expect(buildGarmentForm(photo, { filters: emptyFilters(), limit: 12 }).get("limit")).toBe("12");
  });

  it("posts to the garments endpoint and returns every garment", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeGarmentResponse([{}, {}])));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchGarments(photo, { filters: emptyFilters() });

    expect(result.garments).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/search\/garments$/);
    expect(init.method).toBe("POST");
  });

  it("turns API failures into typed errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ title: "Too many" }, { status: 429, headers: { "retry-after": "30" } })));

    await expect(searchGarments(photo, { filters: emptyFilters() })).rejects.toBeInstanceOf(ApiError);
  });

  it("presents a single garment as an ordinary search response", () => {
    const original = makeSearchResponse();

    const converted = garmentAsSearchResponse(asGarmentResponse(original));

    expect(converted.results).toEqual(original.results);
    expect(converted.detected).toEqual(original.detected);
    expect(converted.regions).toHaveLength(1);
    expect(converted.selected_region).toBe(0);
  });
});
