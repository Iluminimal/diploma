import type { Product } from "./product";

const CLOTHING = ["XS", "S", "M", "L", "XL", "XXL"];
const KIDS_CLOTHING = ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y"];
const SHOES = ["6", "7", "8", "9", "10", "11"];
const KIDS_SHOES = ["10C", "11C", "12C", "13C", "1Y", "2Y"];
const BELTS = ["S", "M", "L"];

type SizeInfo = { label: string; sizes: string[] } | null;

/**
 * Sizes are derived from the category: the catalogue has no size data. Categories where a size
 * makes no sense (watches, bags, jewellery, fragrances) return `null` so no selector is shown.
 */
export function sizesFor(
  p: Pick<Product, "master_category" | "sub_category" | "article_type" | "gender">,
): SizeInfo {
  const kids = p.gender === "Boys" || p.gender === "Girls";
  if (p.master_category === "Apparel") {
    return { label: "Size", sizes: kids ? KIDS_CLOTHING : CLOTHING };
  }
  if (p.master_category === "Footwear") {
    return { label: "Size (US)", sizes: kids ? KIDS_SHOES : SHOES };
  }
  if (p.sub_category === "Belts") return { label: "Size", sizes: BELTS };
  return null;
}
