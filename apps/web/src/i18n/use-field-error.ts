import { useTranslations } from "next-intl";

/**
 * Form-ийн талбарын алдааны мессеж. Zod schema нь мессежийн оронд `validation` орчуулгын түлхүүр
 * (жишээ нь "cardNumber") өгдөг; энэ нь түүнийг идэвхтэй хэл рүү хөрвүүлнэ. Түлхүүр биш мессеж
 * (Zod-ын өөрийн) өөрчлөгдөхгүй.
 */
export function useFieldError(): (message: string | undefined) => string | undefined {
  const t = useTranslations("validation") as unknown as ((key: string) => string) & { has: (key: string) => boolean };
  return (message) => (message === undefined ? undefined : t.has(message) ? t(message) : message);
}
