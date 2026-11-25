import { createTranslator } from "next-intl";
import en from "../../messages/en";
import mn from "../../messages/mn";
import type { Locale } from "@/i18n/config";

const ALL = { en, mn } as const;

/** Тестийн идэвхтэй хэл. Анхдагч нь англи, тиймээс одоо байгаа тестүүд англи текстээр шалгана. */
export const testIntl: { locale: Locale } = { locale: "en" };

export function translatorFor(namespace?: string) {
  return createTranslator({
    locale: testIntl.locale,
    messages: ALL[testIntl.locale],
    namespace: namespace as never,
  }) as unknown as ReturnType<typeof import("next-intl").useTranslations>;
}
