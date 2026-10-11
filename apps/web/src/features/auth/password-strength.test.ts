import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password-strength";

describe("passwordStrength", () => {
  it("says nothing for an empty field", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "" });
  });

  it.each([
    [1, 9, "1 more character needed"],
    [1, 5, "5 more characters needed"],
    [2, 10, "Okay. Longer is stronger."],
    [2, 13, "Okay. Longer is stronger."],
    [3, 14, "Good"],
    [3, 19, "Good"],
    [4, 20, "Excellent"],
    [4, 100, "Excellent"],
  ])("score %i at %i characters", (score, length, label) => {
    expect(passwordStrength("x".repeat(length))).toEqual({ score, label });
  });

  it("measures length only, like the API: no credit for symbols, none lost for plain letters", () => {
    expect(passwordStrength("aaaaaaaaaaaa").score).toBe(passwordStrength("a1!B2@c3#D4$").score);
  });

  it("counts a character, not a UTF-16 unit", () => {
    expect(passwordStrength("😀".repeat(10)).score).toBe(2);
  });
});
