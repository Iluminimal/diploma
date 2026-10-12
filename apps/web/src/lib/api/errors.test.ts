import { describe, expect, it } from "vitest";
import { ApiError, errorFromResponse, networkError, userMessage } from "./errors";

function problem(status: number, body: object, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
}

describe("errorFromResponse", () => {
  it("reads an RFC 7807 body", async () => {
    const error = await errorFromResponse(
      problem(429, { title: "Too many requests", status: 429, type: "urn:angel:problem:rate-limited", request_id: "abc" }, { "Retry-After": "12" }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, type: "urn:angel:problem:rate-limited", requestId: "abc", retryAfter: 12 });
  });

  it("survives a non-JSON body", async () => {
    const error = await errorFromResponse(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(error.status).toBe(502);
  });
});

describe("userMessage", () => {
  const make = (status: number, type?: string, retryAfter?: number) =>
    new ApiError({ status, title: "x", type, retryAfter });

  it("explains each upload problem in plain words", () => {
    expect(userMessage(make(413))).toMatch(/too large/i);
    expect(userMessage(make(415))).toMatch(/JPEG, PNG or WebP/);
    expect(userMessage(make(422, "urn:angel:problem:invalid-image"))).toMatch(/couldn't read/i);
  });

  it("tells a refused origin apart from a missing permission", () => {
    expect(userMessage(make(403, "urn:angel:problem:forbidden-origin"))).toMatch(/blocked for your safety/);
    expect(userMessage(make(403, "urn:angel:problem:forbidden"))).toMatch(/isn't allowed/);
    expect(userMessage(make(403))).toMatch(/isn't allowed/);
  });

  it("includes the wait time for rate limits", () => {
    expect(userMessage(make(429, undefined, 30))).toContain("30 seconds");
    expect(userMessage(make(429))).toMatch(/wait a moment/);
  });

  it("handles offline and server errors", () => {
    expect(userMessage(networkError(new TypeError("fetch failed")))).toMatch(/can't reach the server/i);
    expect(userMessage(make(500))).toMatch(/server had a problem/i);
  });

  it("never leaks details of unknown errors", () => {
    expect(userMessage(new Error("ECONNREFUSED 127.0.0.1:5432"))).toBe("Something went wrong. Please try again.");
  });

  it("re-throws aborts so cancelled requests are not shown as errors", () => {
    expect(() => networkError(new DOMException("aborted", "AbortError"))).toThrow(DOMException);
  });
});
