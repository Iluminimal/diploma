import { describe, expect, it } from "vitest";
import { passwordStrength, weakness } from "./password-strength";
import { translatorFor } from "@/test/intl";
import type { AuthTranslator } from "./auth-translator";

const t = translatorFor("auth") as unknown as AuthTranslator;

/** `length` тэмдэгттэй, давтагдаагүй, түгээмэл биш нууц үг (өөр өөр тэмдэгтүүд). */
const varied = (length: number) => Array.from({ length }, (_, i) => "kzjwqvbxmgtd"[i % 12]! + (i >= 12 ? "7" : "")).join("").slice(0, length);

describe("passwordStrength", () => {
  it("says nothing for an empty field", () => {
    expect(passwordStrength("", t)).toEqual({ score: 0, label: "" });
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
    expect(passwordStrength(varied(length), t)).toEqual({ score, label });
  });

  it("measures length, like the API: no credit for symbols, none lost for plain letters", () => {
    expect(passwordStrength("zyxwvutsrqpo", t).score).toBe(passwordStrength("a1!B2@c3#D4$", t).score);
  });

  it("counts a character, not a UTF-16 unit", () => {
    expect(passwordStrength("😀😁😂🤣😃😄😅😆😉😊", t).score).toBe(2);
  });

  it.each([
    ["password123", "Too common to be safe. Pick something longer and less guessable."],
    ["Password1234", "Too common to be safe. Pick something longer and less guessable."],
    ["aaaaaaaaaaaa", "Too repetitive. Pick a longer, more varied password."],
  ])("calls %s weak however long it is", (password, label) => {
    expect(passwordStrength(password, t)).toEqual({ score: 1, label });
  });
});

describe("weakness", () => {
  it.each(["password", "passw0rd!", "Qwerty12345", "welcome1234", "1234567890", "Mongolia2026"])(
    "flags %s as common",
    (password) => expect(weakness(password)).toBe("common"),
  );

  it.each(["aaaaaaaaaaaa", "ababababab", "😀😀😀😀😀😀😀😀😀😀"])("flags %s as repeated", (password) =>
    expect(weakness(password)).toBe("repeated"),
  );

  it.each(["correct horse battery", "password-horse-battery-staple", "Tr0ub4dor&3xyz"])(
    "lets %s through",
    (password) => expect(weakness(password)).toBeNull(),
  );
});
