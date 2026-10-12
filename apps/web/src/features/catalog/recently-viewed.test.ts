import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "@/test/fixtures";
import { readRecentlyViewed, recordView } from "./recently-viewed";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("recently viewed", () => {
  it("is empty for a first visit", () => {
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("remembers products, newest first, and a revisit moves to the front without duplicating", () => {
    recordView(makeProduct({ id: 1 }));
    recordView(makeProduct({ id: 2 }));
    recordView(makeProduct({ id: 1 }));

    expect(readRecentlyViewed().map((p) => p.id)).toEqual([1, 2]);
  });

  it("keeps the last twelve", () => {
    for (let id = 1; id <= 15; id += 1) recordView(makeProduct({ id }));

    const ids = readRecentlyViewed().map((p) => p.id);
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe(15);
    expect(ids).not.toContain(3);
  });

  it("drops the blur placeholder to keep entries small", () => {
    recordView(makeProduct({ id: 1, image: { thumb_400: "a", thumb_800: "b", blur_data_url: "data:image/jpeg;base64,AAAA" } }));

    expect(readRecentlyViewed()[0]?.image.blur_data_url).toBeNull();
  });

  it("returns the same array until something changes, as useSyncExternalStore needs", () => {
    recordView(makeProduct({ id: 1 }));

    expect(readRecentlyViewed()).toBe(readRecentlyViewed());
  });

  it("ignores junk in storage", () => {
    window.localStorage.setItem("angel:recently-viewed", JSON.stringify([{ id: "x" }, null, 5, makeProduct({ id: 7 })]));

    expect(readRecentlyViewed().map((p) => p.id)).toEqual([7]);
    window.localStorage.setItem("angel:recently-viewed", "{not json");
    expect(readRecentlyViewed()).toEqual([]);
    window.localStorage.setItem("angel:recently-viewed", '{"a":1}');
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("works, as nothing, when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => recordView(makeProduct())).not.toThrow();
    expect(readRecentlyViewed()).toEqual([]);
  });
});
