import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, rankLocales, suggestLocale } from "./config";

describe("DEFAULT_LOCALE", () => {
  it("is Mongolian: a visitor with no saved choice reads Mongolian whatever the browser asks for", () => {
    expect(DEFAULT_LOCALE).toBe("mn");
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("mn")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("constructor")).toBe(false);
  });
});

describe("rankLocales", () => {
  it("lists supported languages by preference without duplicates", () => {
    expect(rankLocales("en-US, en;q=0.9, mn;q=0.8")).toEqual(["en", "mn"]);
    expect(rankLocales("mn;q=0.3, fr, en;q=0.5")).toEqual(["en", "mn"]);
    expect(rankLocales("fr, de")).toEqual([]);
    expect(rankLocales(null)).toEqual([]);
  });
});

describe("suggestLocale", () => {
  it("suggests the visitor's country language first", () => {
    expect(suggestLocale({ current: "en", country: "MN", acceptLanguage: "en" })).toBe("mn");
    expect(suggestLocale({ current: "en", country: "mn" })).toBe("mn");
    expect(suggestLocale({ current: "mn", country: "MN", acceptLanguage: "mn, en" })).toBeNull();
  });

  it("otherwise suggests another language the browser accepts", () => {
    expect(suggestLocale({ current: "en", country: "US", acceptLanguage: "en, mn;q=0.5" })).toBe("mn");
    expect(suggestLocale({ current: "en", acceptLanguage: "en-US, en" })).toBeNull();
    expect(suggestLocale({ current: "en", acceptLanguage: "mn;q=0, en" })).toBeNull();
    expect(suggestLocale({ current: "en" })).toBeNull();
  });
});
