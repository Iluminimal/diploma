import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en";
import mn from "../../../messages/mn";
import { ApiError, createUserMessage, errorFromBody, errorFromResponse, networkError, userMessage, type ErrorTranslator } from "./errors";

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

describe("userMessage in Mongolian", () => {
  const message = createUserMessage(
    createTranslator({ locale: "mn", messages: mn, namespace: "errors" }) as unknown as ErrorTranslator,
  );
  const make = (status: number, type?: string, retryAfter?: number) =>
    new ApiError({ status, title: "x", type, retryAfter });

  it("answers in Mongolian and keeps interpolated values", () => {
    expect(message(make(413))).toContain("Зураг хэт том");
    expect(message(make(429, undefined, 30))).toContain("30 секундын");
    expect(message(networkError(new TypeError("fetch failed")))).toContain("Сервертэй холбогдож");
    expect(message(new Error("boom"))).toBe("Алдаа гарлаа. Дахин оролдоно уу.");
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

  it("builds stock messages from the available count, not the server's English text", () => {
    const stock = (available: number) => {
      const error = new ApiError({ status: 409, title: "x", type: "urn:angel:problem:insufficient-stock", detail: "Only 2 of Blue Kurta can be added." });
      error.extensions = { available };
      return error;
    };
    expect(userMessage(stock(2))).toBe("Only 2 can be added.");
    expect(userMessage(stock(0))).toBe("That item is sold out.");
  });

  it("pluralises the rate-limit wait in English", () => {
    expect(userMessage(make(429, undefined, 1))).toContain("1 second.");
  });

  it("never leaks details of unknown errors", () => {
    expect(userMessage(new Error("ECONNREFUSED 127.0.0.1:5432"))).toBe("Something went wrong. Please try again.");
  });

  it("re-throws aborts so cancelled requests are not shown as errors", () => {
    expect(() => networkError(new DOMException("aborted", "AbortError"))).toThrow(DOMException);
  });
});

describe("weak password", () => {
  const t = createTranslator({ locale: "en", messages: en, namespace: "errors" }) as unknown as ErrorTranslator;
  const message = createUserMessage(t);

  it.each([
    ["common", "That password is too common and easy to guess. Choose a different, longer one."],
    ["repeated", "That password repeats the same characters. Choose a more varied one."],
    ["contains_identity", "That password contains your email or name. Choose a different one."],
  ])("says why a %s password was refused", (reason, text) => {
    const error = errorFromBody(
      { title: "Weak", status: 422, type: "urn:angel:problem:weak-password", reason },
      new Response(null, { status: 422 }),
    );

    expect(message(error)).toBe(text);
  });
});
