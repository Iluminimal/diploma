import { describe, expect, it } from "vitest";
import { createFormat } from "./format";
import { createVocab } from "./vocab";

describe("createVocab", () => {
  it("returns English names unchanged", () => {
    const en = createVocab("en");
    expect(en.colour("Navy Blue")).toBe("Navy Blue");
    expect(en.category("Topwear")).toBe("Topwear");
  });

  it("translates dataset vocabulary into Mongolian", () => {
    const mn = createVocab("mn");
    expect(mn.department("Women")).toBe("Эмэгтэй");
    expect(mn.gender("Girls")).toBe("Охид");
    expect(mn.colour("Navy Blue")).toBe("Хар хөх");
    expect(mn.category("T-shirts")).toBe("Футболк");
    expect(mn.season("Winter")).toBe("Өвөл");
    expect(mn.usage("Smart Casual")).toBe("Хагас албан ёсны");
  });

  it("translates every raw category name the catalogue uses", () => {
    // DB-ийн DISTINCT нэрс (түүхий dataset): "Apparel" нь барааны 51%, "Tshirts" 17%.
    const raw = [
      "Apparel",
      "Apparel Set",
      "Loungewear and Nightwear",
      "Sandal",
      "Innerwear Vests",
      "Key chain",
      "Lounge Tshirts",
      "Necklace and Chains",
      "Perfume and Body Mist",
      "Salwar and Dupatta",
      "Ties and Cufflinks",
      "Tshirts",
    ];
    const vocab = createVocab("mn");

    for (const name of raw) expect(vocab.category(name), name).not.toBe(name);
    expect(vocab.category("Apparel")).toBe("Хувцас");
    expect(vocab.category("Tshirts")).toBe(vocab.category("T-shirts"));
  });

  it("keeps unknown values as they are, including prototype keys", () => {
    const mn = createVocab("mn");
    expect(mn.colour("Plaid")).toBe("Plaid");
    expect(mn.category("constructor")).toBe("constructor");
    expect(createVocab("fr").colour("Black")).toBe("Black");
  });

  it("is stable per locale", () => {
    expect(createVocab("mn")).toBe(createVocab("mn"));
  });
});

describe("createFormat", () => {
  it("formats prices and numbers per locale", () => {
    expect(createFormat("en").price(8_790_000)).toBe("₮87,900");
    expect(createFormat("en").price(2500, "USD")).toBe("$25");
    expect(createFormat("mn").price(2550, "USD")).toContain("25.50");
    expect(createFormat("en").number(1234567)).toBe("1,234,567");
  });

  it("formats dates in the active language", () => {
    const date = "2026-10-31T12:00:00Z";
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    } as const;
    expect(createFormat("en").date(date, options)).toBe("October 31, 2026");
    expect(createFormat("mn").date(date, options)).toContain("2026 оны");
  });
});
