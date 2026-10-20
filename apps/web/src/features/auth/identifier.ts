import { toE164 } from "./phone-input";
import type { CountryCode } from "libphonenumber-js/min";

/** "Имэйл эсвэл утас" гэсэн ганц талбарт хэрэглэгчийн бичсэн зүйл. */
export type Identifier =
  | { kind: "email"; destination: string; shown: string }
  | { kind: "phone"; destination: string; shown: string };

/**
 * Текст зөвхөн утасны дугаар байж болох үед true: цифр, зай, ердийн тэмдэгтүүд, цифр, "+" эсвэл
 * "("-ээр эхэлсэн. Үсэг эсвэл "@" агуулсан бол имэйл, хоосон талбар ч имэйл.
 */
export function looksLikePhone(text: string): boolean {
  return /^[+(\d][\d\s().+-]*$/.test(text.trim());
}

/**
 * Талбар дахь имэйл эсвэл утасны дугаарыг API-ийн хүссэн хэлбэрээр, эсвэл яагаад болохгүй байгаа
 * шалтгааныг буцаана.
 */
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
