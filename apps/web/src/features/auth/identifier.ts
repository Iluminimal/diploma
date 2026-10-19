import { toE164 } from "./phone-input";
import type { CountryCode } from "libphonenumber-js/min";

/** What somebody typed into the one "email or phone" field. */
export type Identifier =
  | { kind: "email"; destination: string; shown: string }
  | { kind: "phone"; destination: string; shown: string };

/**
 * True while the text can only be a phone number: digits, spaces and the usual punctuation, starting
 * with a digit, "+" or "(". Anything with a letter or an "@" is an email, and so is an empty field.
 */
export function looksLikePhone(text: string): boolean {
  return /^[+(\d][\d\s().+-]*$/.test(text.trim());
}

/** The email or phone number in the field in the form the API wants, or the reason it is not one. */
export function parseIdentifier(text: string, region: CountryCode): Identifier | { error: string } {
  const typed = text.trim();
  if (!typed) return { error: "Enter your email or phone number." };
  if (looksLikePhone(typed)) {
    const destination = toE164(typed, region);
    return destination ? { kind: "phone", destination, shown: typed } : { error: "Enter a valid phone number." };
  }
  const email = typed.toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email)
    ? { kind: "email", destination: email, shown: typed }
    : { error: "Enter a valid email address or phone number." };
}
