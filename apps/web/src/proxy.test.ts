import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const request = (path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
  });

afterEach(() => vi.unstubAllEnvs());

describe("proxy: login gate", () => {
  it.each(["/account", "/account/orders", "/checkout", "/admin", "/admin/products?stock=low"])(
    "sends %s to the login page without a session, remembering where it was going",
    (path) => {
      const response = proxy(request(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`http://localhost:3000/login?next=${encodeURIComponent(path)}`);
    },
  );

  it("lets a signed-in visitor through", () => {
    expect(proxy(request("/account", { cookie: "lk_session=1" })).status).toBe(200);
  });

  it("does not treat a look-alike path as protected", () => {
    expect(proxy(request("/accounting")).headers.get("location")).toBeNull();
  });
});

describe("proxy: content security policy", () => {
  it("puts a nonce-based policy on the response, matching the nonce it hands to the page", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(request("/products"));

    const csp = response.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("uses a different nonce for every request", () => {
    const first = proxy(request("/")).headers.get("x-middleware-request-x-nonce");
    const second = proxy(request("/")).headers.get("x-middleware-request-x-nonce");

    expect(first).not.toBe(second);
  });

  it("only reports in development, and enforces when CSP_MODE says so", () => {
    vi.stubEnv("NODE_ENV", "development");
    const dev = proxy(request("/"));
    expect(dev.headers.get("content-security-policy-report-only")).toBeTruthy();
    expect(dev.headers.get("content-security-policy")).toBeNull();

    vi.stubEnv("CSP_MODE", "enforce");
    expect(proxy(request("/")).headers.get("content-security-policy")).toBeTruthy();
  });

  it("upgrades insecure requests behind an https proxy, not on plain http", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(request("/")).headers.get("content-security-policy")).not.toContain("upgrade-insecure-requests");
    const behindProxy = proxy(request("/", { headers: { "x-forwarded-proto": "https" } }));
    expect(behindProxy.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
  });
});
