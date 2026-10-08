import { describe, expect, it } from "vitest";
import { makeAdminProduct } from "@/test/fixtures";
import {
  buildCreateForm,
  centsToDollars,
  dollarsToCents,
  imageProblem,
  productSchema,
  toChanges,
  toFormValues,
  toPayload,
} from "./product-values";

const valid = { ...toFormValues(), name: "Linen shirt", category_id: "9", price: "49.99" };

describe("prices", () => {
  it.each([
    ["49.99", 4999],
    ["50", 5000],
    ["0.5", 50],
    ["0.05", 5],
    ["0", 0],
    ["1000.10", 100010],
  ])("%s dollars is %i cents", (text, cents) => {
    expect(dollarsToCents(text)).toBe(cents);
  });

  it("shows cents as dollars", () => {
    expect(centsToDollars(4999)).toBe("49.99");
    expect(centsToDollars(5000)).toBe("50.00");
  });

  it.each(["", "abc", "49.999", "-5", "1,50", "123456", ".5"])("rejects %j as a price", (price) => {
    expect(productSchema.safeParse({ ...valid, price }).success).toBe(false);
  });
});

describe("product schema", () => {
  it("accepts a complete product", () => {
    expect(productSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["name", " "],
    ["category_id", ""],
    ["gender", "Robots"],
    ["season", "Monsoon"],
    ["year", "1850"],
    ["year", "20x4"],
    ["stock_quantity", "-1"],
    ["stock_quantity", "1.5"],
    ["stock_quantity", "100001"],
  ])("rejects %s = %j", (field, value) => {
    expect(productSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});

describe("payloads", () => {
  it("converts typed text to numbers and null options", () => {
    expect(toPayload({ ...valid, year: "2024", season: "Summer", stock_quantity: "7" })).toEqual({
      name: "Linen shirt",
      category_id: 9,
      gender: "Women",
      base_colour: null,
      season: "Summer",
      usage: null,
      year: 2024,
      price_cents: 4999,
      stock_quantity: 7,
      is_active: true,
    });
  });

  it("round-trips a product through the form", () => {
    const product = makeAdminProduct({ price_cents: 1250, season: null, base_colour: "Blue" });

    const payload = toPayload(toFormValues(product));

    expect(payload.price_cents).toBe(1250);
    expect(payload.season).toBeNull();
    expect(payload.base_colour).toBe("Blue");
    expect(payload.category_id).toBe(product.category_id);
  });

  it("sends only the filled-in options in the create form", () => {
    const photo = new File(["x"], "shirt.jpg", { type: "image/jpeg" });

    const form = buildCreateForm(toPayload({ ...valid, base_colour: "Blue" }), photo);

    expect(form.get("file")).toBeInstanceOf(File);
    expect(form.get("price_cents")).toBe("4999");
    expect(form.get("category_id")).toBe("9");
    expect(form.get("is_active")).toBe("true");
    expect(form.get("base_colour")).toBe("Blue");
    expect(form.has("season")).toBe(false);
    expect(form.has("year")).toBe(false);
  });

  it("clears options with null and never sends is_active in an edit", () => {
    const changes = toChanges(toPayload(valid));

    expect(changes).toMatchObject({ base_colour: null, season: null, usage: null, year: null });
    expect("is_active" in changes).toBe(false);
  });
});

describe("photo checks", () => {
  it("accepts the supported types", () => {
    expect(imageProblem(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(imageProblem(new File(["x"], "a.webp", { type: "image/webp" }))).toBeNull();
  });

  it("rejects other types, empty files and huge files", () => {
    expect(imageProblem(new File(["x"], "a.gif", { type: "image/gif" }))).toMatch(/JPEG, PNG or WebP/);
    expect(imageProblem(new File([], "a.jpg", { type: "image/jpeg" }))).toMatch(/empty/);
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "a.jpg", { type: "image/jpeg" });
    expect(imageProblem(big)).toMatch(/8 MB/);
  });
});
