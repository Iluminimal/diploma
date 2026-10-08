import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNext("/checkout")).toBe("/checkout");
    expect(safeNext("/products/12/blue-shirt?size=M")).toBe(
      "/products/12/blue-shirt?size=M",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "checkout",
    "",
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBe("/");
  });

  it("does not bounce back to the auth pages", () => {
    expect(safeNext("/login?next=/cart")).toBe("/");
    expect(safeNext("/register")).toBe("/");
  });

  it("uses the first of repeated parameters and the given fallback", () => {
    expect(safeNext(["/cart", "/account"])).toBe("/cart");
    expect(safeNext(undefined, "/account")).toBe("/account");
  });
});
