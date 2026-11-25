import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, INTL_LOCALE, isLocale } from "@/i18n/config";

/** Админы өөрийн цагийн бүс дэх "Oct 8, 2026, 10:00 AM" хэлбэр (идэвхтэй хэлээр). */
export const when = (iso: string, tag = "en-US") =>
  new Date(iso).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" });

/** "Oct 8, 2026" хэлбэр (идэвхтэй хэлээр). */
export const day = (iso: string, tag = "en-US") => new Date(iso).toLocaleDateString(tag, { dateStyle: "medium" });

/** Идэвхтэй хэлний `when`/`day`: хэл солигдоход огноо нь дагана. */
export function useDates() {
  const locale = useLocale();
  const tag = INTL_LOCALE[isLocale(locale) ? locale : DEFAULT_LOCALE];
  return { when: (iso: string) => when(iso, tag), day: (iso: string) => day(iso, tag) };
}
