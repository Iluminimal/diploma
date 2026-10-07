import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReadiness } from "./api";

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchReadiness", () => {
  it("is ready on a 200 with checks", async () => {
    mockFetch(async () =>
      Response.json({ status: "ok", checks: { database: "ok", redis: "ok" } }),
    );
    expect(await fetchReadiness()).toEqual({
      state: "ready",
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("is degraded on a 503 problem body", async () => {
    mockFetch(async () =>
      Response.json(
        { title: "Service not ready", status: 503, checks: { database: "fail" } },
        { status: 503 },
      ),
    );
    expect(await fetchReadiness()).toEqual({
      state: "degraded",
      checks: { database: "fail" },
    });
  });

  it("is unreachable when the network fails", async () => {
    mockFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchReadiness()).toEqual({ state: "unreachable" });
  });

  it("is unreachable when the body is not the expected shape", async () => {
    mockFetch(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await fetchReadiness()).toEqual({ state: "unreachable" });
  });
});
