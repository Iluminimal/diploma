import { describe, expect, it } from "vitest";
import { looksLikePhone, parseIdentifier } from "./identifier";

describe("looksLikePhone", () => {
  it.each(["4155552671", "+1 415 555 2671", "(415) 555-2671", " 415.555.2671 ", "+976"])("%s is a phone number", (text) => {
    expect(looksLikePhone(text)).toBe(true);
  });

  it.each(["", "a", "me@x.com", "415 555 call", "1@2.com", "-5"])("%s is not", (text) => {
    expect(looksLikePhone(text)).toBe(false);
  });
});

describe("parseIdentifier", () => {
  it("normalises an email", () => {
    expect(parseIdentifier("  Me@Example.COM ", "US")).toEqual({ kind: "email", destination: "me@example.com", shown: "Me@Example.COM" });
  });

  it("turns a phone number into international form using the chosen country", () => {
    expect(parseIdentifier("(415) 555-2671", "US")).toEqual({ kind: "phone", destination: "+14155552671", shown: "(415) 555-2671" });
    expect(parseIdentifier("+44 20 7946 0958", "US")).toMatchObject({ kind: "phone", destination: "+442079460958" });
  });

  it("explains what is wrong", () => {
    expect(parseIdentifier("", "US")).toEqual({ error: "Enter your email or phone number." });
    expect(parseIdentifier("12", "US")).toEqual({ error: "Enter a valid phone number." });
    expect(parseIdentifier("not an email", "US")).toEqual({ error: "Enter a valid email address or phone number." });
  });
});
