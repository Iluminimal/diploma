/** Helpers for the demo card form: grouping what is typed and naming the card from its first digits. */

export type CardBrand = "Visa" | "Mastercard" | "American Express" | "Discover";

export function cardBrand(number: string): CardBrand | null {
  const digits = number.replace(/\D/g, "");
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^(6011|65|64[4-9])/.test(digits)) return "Discover";
  return null;
}

/** "4242424242424242" -> "4242 4242 4242 4242" (Amex: 4-6-5), at most 19 digits. */
export function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  const groups = cardBrand(digits) === "American Express" ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const parts: string[] = [];
  let at = 0;
  for (const size of groups) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return parts.join(" ");
}

/**
 * "1234" -> "12/34"; a first digit above 1 can only be a month, so "5" becomes "05/".
 * `previous` is what the field held before this keystroke: deleting back over the slash must
 * leave "12", not put the slash straight back.
 */
export function formatExpiry(raw: string, previous = ""): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 1 && digits > "1") return `0${digits}/`;
  if (digits.length < 2) return digits;
  if (digits.length === 2) return previous.length > raw.length ? digits : `${digits}/`;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
