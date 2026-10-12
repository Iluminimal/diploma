import { describe, expect, it } from "vitest";
import { cardBrand, formatCardNumber, formatExpiry } from "./card";

describe("cardBrand", () => {
  it.each([
    ["4242 4242 4242 4242", "Visa"],
    ["5555 5555 5555 4444", "Mastercard"],
    ["2223 0000 4841 0016", "Mastercard"],
    ["3782 822463 10005", "American Express"],
    ["6011 1111 1111 1117", "Discover"],
    ["9999", null],
    ["", null],
  ])("%s is %s", (number, brand) => {
    expect(cardBrand(number)).toBe(brand);
  });
});

describe("formatCardNumber", () => {
  it("groups by four as digits are typed and drops everything else", () => {
    expect(formatCardNumber("4242")).toBe("4242");
    expect(formatCardNumber("42424")).toBe("4242 4");
    expect(formatCardNumber("4242-4242 4242.4242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("42424242424242424242424")).toBe("4242 4242 4242 4242 424");
  });

  it("groups an American Express number 4-6-5", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });
});

describe("formatExpiry", () => {
  it("puts the slash in as the month is completed", () => {
    expect(formatExpiry("1")).toBe("1");
    expect(formatExpiry("12")).toBe("12/");
    expect(formatExpiry("123")).toBe("12/3");
    expect(formatExpiry("12/34")).toBe("12/34");
    expect(formatExpiry("123456")).toBe("12/34");
  });

  it("turns a first digit above 1 into a month", () => {
    expect(formatExpiry("5")).toBe("05/");
  });

  it("lets the slash be deleted", () => {
    expect(formatExpiry("12", "12/")).toBe("12");
  });
});
