import { describe, expect, it } from "vitest";
import { AIMAGS, CAPITAL_DISTRICTS, REGIONS, displayPhone, formatLocalPhone, localPhoneDigits, zoneFor } from "./mongolia";

describe("Mongolian administrative data", () => {
  it("has the capital plus 21 aimags and 9 capital districts", () => {
    expect(AIMAGS).toHaveLength(21);
    expect(REGIONS).toHaveLength(22);
    expect(REGIONS[0]).toBe("Улаанбаатар");
    expect(CAPITAL_DISTRICTS).toHaveLength(9);
  });

  it("puts Ulaanbaatar in the ub zone and every aimag in rural", () => {
    expect(zoneFor("Улаанбаатар")).toBe("ub");
    expect(zoneFor("Дархан-Уул")).toBe("rural");
    expect(zoneFor(undefined)).toBe("rural");
  });
});

describe("localPhoneDigits", () => {
  it.each([
    ["99112233", "99112233"],
    ["9911 2233", "99112233"],
    ["9911-2233", "99112233"],
    ["+976 9911 2233", "99112233"],
    ["+97699112233", "99112233"],
  ])("accepts %s", (raw, expected) => {
    expect(localPhoneDigits(raw)).toBe(expected);
  });

  it.each(["", "9911223", "991122334", "+44 20 7946 0958", "call me"])("rejects %s", (raw) => {
    expect(localPhoneDigits(raw)).toBeNull();
  });

  it("formats a stored number for the form", () => {
    expect(formatLocalPhone("+97699112233")).toBe("9911 2233");
    expect(formatLocalPhone(null)).toBe("");
    expect(displayPhone("+97699112233")).toBe("+976 9911 2233");
    expect(displayPhone(null)).toBe("");
  });
});
