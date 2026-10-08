import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return (await import("./env")).env;
}

describe("env", () => {
  it("defaults to the local development addresses", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    expect(await load()).toEqual({
      NEXT_PUBLIC_API_URL: "http://localhost:8000",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    });
  });

  it("drops trailing slashes from the site URL so paths can be appended safely", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.com//");

    expect((await load()).NEXT_PUBLIC_SITE_URL).toBe("https://shop.example.com");
  });

  it("refuses a site URL that is not a URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "shop.example.com");

    await expect(load()).rejects.toThrow();
  });
});
