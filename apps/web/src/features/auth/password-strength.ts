import type { AuthTranslator } from "./auth-translator";

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

/**
 * Түгээмэл нууц үгийн "үндэс": дараа нь хэдэн тоо, тэмдэгт залгасан бол сул. API-ийн
 * `core/passwords.py`-ийн жижиг хувилбар (бүрэн жагсаалт серверт; энд зөвхөн шууд сануулга өгнө,
 * шийдвэр нь API-ийнх).
 */
const COMMON_ROOTS = [
  "password",
  "passw0rd",
  "qwerty",
  "welcome",
  "iloveyou",
  "letmein",
  "admin",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "mongolia",
  "ulaanbaatar",
  "angel",
  "1234567890",
  "abcdefghij",
  "1q2w3e4r5t",
];

export type Weakness = "common" | "repeated";

/** Сул нууц үгийн шалтгаан, эсвэл `null`. API-тэй ижил дүрэм: түгээмэл үндэс + хэдэн тэмдэгт, эсвэл хоёроос цөөн өөр тэмдэгт. */
export function weakness(password: string): Weakness | null {
  const lowered = password.toLowerCase();
  const stripped = lowered.replace(/[\d!@#$%^&*._-]+$/, "");
  for (const root of COMMON_ROOTS) {
    if (stripped === root || lowered === root || (stripped.startsWith(root) && lowered.length <= root.length + 5)) {
      return "common";
    }
  }
  return new Set(lowered).size <= 2 ? "repeated" : null;
}

/**
 * Хэр урт нь хангалттай вэ гэдгийг үгээр хэлнэ. Уртыг хэмжинэ, API-ийн дүрэм шиг (10-128 тэмдэгт,
 * цифр, тэмдэгтийн шаардлагагүй): урт passphrase нь богино "төвөгтэй" нууц үгээс дээр. Түгээмэл эсвэл
 * давтагдсан нууц үгийг урт нь хүрсэн ч сул гэж үзнэ (API татгалзана).
 */
export function passwordStrength(password: string, t: AuthTranslator): Strength {
  const length = [...password].length;
  if (length === 0) return { score: 0, label: "" };
  if (length < 10) {
    return { score: 1, label: t("strength.needed", { count: 10 - length }) };
  }
  const weak = weakness(password);
  if (weak) return { score: 1, label: t(weak === "common" ? "strength.common" : "strength.repeated") };
  if (length < 14) return { score: 2, label: t("strength.okay") };
  if (length < 20) return { score: 3, label: t("strength.good") };
  return { score: 4, label: t("strength.excellent") };
}
