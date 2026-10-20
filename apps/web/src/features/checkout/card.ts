/** Demo картын form-ын туслахууд: бичсэнийг бүлэглэх, эхний цифрээс картын нэрийг тодорхойлох. */

export type CardBrand = "Visa" | "Mastercard" | "American Express" | "Discover";

export function cardBrand(number: string): CardBrand | null {
  const digits = number.replace(/\D/g, "");
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^(6011|65|64[4-9])/.test(digits)) return "Discover";
  return null;
}

/** "4242424242424242" -> "4242 4242 4242 4242" (Amex: 4-6-5), хамгийн ихдээ 19 цифр. */
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
 * "1234" -> "12/34"; 1-ээс их эхний цифр зөвхөн сар байж болох тул "5" нь "05/" болно. `previous`
 * нь энэ товчлолтоос өмнө талбарт байсан утга: slash дээгүүр устгахад "12" үлдэх ёстой, slash шууд
 * буцаж орох ёсгүй.
 */
export function formatExpiry(raw: string, previous = ""): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 1 && digits > "1") return `0${digits}/`;
  if (digits.length < 2) return digits;
  if (digits.length === 2) return previous.length > raw.length ? digits : `${digits}/`;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
