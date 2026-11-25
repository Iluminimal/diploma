import { describe, expect, it } from "vitest";
import {
  buildCsp,
  CSP_REPORT_PATH,
  cspHeaderName,
  newNonce,
  resolveCspMode,
  staticSecurityHeaders,
} from "./security-headers";

const directives = (csp: string) =>
  Object.fromEntries(csp.split("; ").map((part) => [part.split(" ")[0]!, part.split(" ").slice(1)]));

describe("buildCsp", () => {
  const prod = directives(buildCsp({ nonce: "N", development: false, https: true }));

  it("lets scripts run only with the request's nonce (and what they load), never inline without it", () => {
    expect(prod["script-src"]).toEqual(["'self'", "'nonce-N'", "'strict-dynamic'"]);
    expect(prod["script-src"]).not.toContain("'unsafe-inline'");
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("shuts frames, plugins, other base URLs and clickjacking, and keeps forms on this site", () => {
    expect(prod["frame-src"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("keeps requests on this origin, with room for what the app really loads", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
    expect(prod["connect-src"]).toEqual(["'self'"]);
    expect(prod["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
    expect(prod["media-src"]).toEqual(["'self'", "blob:"]); // camera preview
    expect(prod["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  it("lets the browser reach the API's own origin, which a few calls (suggestions, the category tree) use directly", () => {
    const withApi = directives(
      buildCsp({ nonce: "N", development: false, https: true, apiOrigin: "https://api.shop.example" }),
    );
    expect(withApi["connect-src"]).toEqual(["'self'", "https://api.shop.example"]);
    expect(withApi["img-src"]).toContain("https://api.shop.example");
  });

  it("reports violations to the API", () => {
    expect(prod["report-uri"]).toEqual([CSP_REPORT_PATH]);
  });

  it("only upgrades insecure requests over https, so a local http build still works", () => {
    expect(buildCsp({ nonce: "N", development: false, https: true })).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "N", development: false, https: false })).not.toContain("upgrade-insecure-requests");
  });

  it("allows eval and websockets in development only (hot reload)", () => {
    const dev = directives(buildCsp({ nonce: "N", development: true, https: false }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toEqual(expect.arrayContaining(["ws:", "wss:"]));
    expect(prod["connect-src"]).not.toContain("ws:");
  });
});

describe("nonce and mode", () => {
  it("makes a fresh, unguessable nonce each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, newNonce));
    expect(nonces.size).toBe(50);
    expect([...nonces][0]).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
  });

  it("enforces in production and only reports in development, unless told otherwise", () => {
    expect(resolveCspMode(undefined, true)).toBe("enforce");
    expect(resolveCspMode(undefined, false)).toBe("report-only");
    expect(resolveCspMode("report-only", true)).toBe("report-only");
    expect(resolveCspMode("enforce", false)).toBe("enforce");
    expect(resolveCspMode("nonsense", true)).toBe("enforce");
  });

  it("uses the matching header name", () => {
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
  });
});

describe("staticSecurityHeaders", () => {
  const byKey = (production: boolean) =>
    Object.fromEntries(staticSecurityHeaders({ production }).map((h) => [h.key, h.value]));

  it("sets the fixed headers", () => {
    const headers = byKey(true);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
  });

  it("sends HSTS in production only", () => {
    expect(byKey(true)["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(byKey(false)["Strict-Transport-Security"]).toBeUndefined();
  });
});
