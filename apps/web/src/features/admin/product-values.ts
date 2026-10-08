import { z } from "zod";
import type { AdminProduct, AdminProductChanges } from "./admin-api";

export const GENDERS = ["Men", "Women", "Boys", "Girls", "Unisex"] as const;
export const SEASONS = ["Fall", "Spring", "Summer", "Winter"] as const;
export const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** "49.99" -> 4999. Whole cents only: the form never lets a fraction of a cent through. */
export function dollarsToCents(text: string): number {
  const [whole = "0", fraction = ""] = text.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Why a photo can't be used, or null when it can. Mirrors what the API enforces. */
export function imageProblem(file: File): string | null {
  if (!ACCEPTED_IMAGES.includes(file.type)) return "Use a JPEG, PNG or WebP photo.";
  if (file.size > MAX_IMAGE_BYTES) return "That photo is larger than 8 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

const text = (max: number) => z.string().trim().max(max);

/** Everything is text while it is being typed; `toPayload` converts once it is valid. */
export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(300),
  category_id: z.string().min(1, "Choose a category"),
  gender: z.enum(GENDERS, { message: "Choose a gender" }),
  base_colour: text(50),
  season: z.enum(["", ...SEASONS]),
  usage: text(50),
  year: z.string().trim().refine((value) => value === "" || /^(19|20|21)\d{2}$/.test(value), "Enter a four-digit year"),
  price: z.string().trim().regex(/^\d{1,5}(\.\d{1,2})?$/, "Enter a price like 49.99"),
  stock_quantity: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/, "Enter a whole number")
    .refine((value) => Number(value) <= 100_000, "That is more than the shop can hold"),
  is_active: z.boolean(),
});
export type ProductFormValues = z.infer<typeof productSchema>;

export type ProductPayload = {
  name: string;
  category_id: number;
  gender: (typeof GENDERS)[number];
  base_colour: string | null;
  season: (typeof SEASONS)[number] | null;
  usage: string | null;
  year: number | null;
  price_cents: number;
  stock_quantity: number;
  is_active: boolean;
};

export function toPayload(values: ProductFormValues): ProductPayload {
  return {
    name: values.name,
    category_id: Number(values.category_id),
    gender: values.gender,
    base_colour: values.base_colour || null,
    season: values.season || null,
    usage: values.usage || null,
    year: values.year ? Number(values.year) : null,
    price_cents: dollarsToCents(values.price),
    stock_quantity: Number(values.stock_quantity),
    is_active: values.is_active,
  };
}

export function toFormValues(product?: AdminProduct): ProductFormValues {
  return {
    name: product?.name ?? "",
    category_id: product ? String(product.category_id) : "",
    gender: (product?.gender as ProductFormValues["gender"] | undefined) ?? "Women",
    base_colour: product?.base_colour ?? "",
    season: (product?.season as ProductFormValues["season"] | null | undefined) ?? "",
    usage: product?.usage ?? "",
    year: product?.year ? String(product.year) : "",
    price: product ? centsToDollars(product.price_cents) : "",
    stock_quantity: product ? String(product.stock_quantity) : "0",
    is_active: product?.is_active ?? true,
  };
}

/** The create endpoint takes a multipart form: the photo plus the details; empty options are left out. */
export function buildCreateForm(payload: ProductPayload, photo: File): FormData {
  const form = new FormData();
  form.append("file", photo);
  form.append("name", payload.name);
  form.append("category_id", String(payload.category_id));
  form.append("gender", payload.gender);
  form.append("price_cents", String(payload.price_cents));
  form.append("stock_quantity", String(payload.stock_quantity));
  form.append("is_active", String(payload.is_active));
  if (payload.base_colour) form.append("base_colour", payload.base_colour);
  if (payload.season) form.append("season", payload.season);
  if (payload.usage) form.append("usage", payload.usage);
  if (payload.year !== null) form.append("year", String(payload.year));
  return form;
}

/** A PATCH body; a cleared optional field is sent as null so it is actually cleared. */
export function toChanges(payload: ProductPayload): AdminProductChanges {
  return {
    name: payload.name,
    category_id: payload.category_id,
    gender: payload.gender,
    base_colour: payload.base_colour,
    season: payload.season,
    usage: payload.usage,
    year: payload.year,
    price_cents: payload.price_cents,
    stock_quantity: payload.stock_quantity,
  };
}
