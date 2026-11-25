import { describe, expect, it } from "vitest";
import { parseMode } from "./auth-mode";

describe("parseMode", () => {
  it("opens create-account only when asked to", () => {
    expect(parseMode("register")).toBe("register");
    expect(parseMode(["register", "login"])).toBe("register");
  });

  it.each([undefined, "", "login", "admin", ["login"], []])("falls back to sign in for %j", (value) => {
    expect(parseMode(value as string | string[] | undefined)).toBe("login");
  });
});
