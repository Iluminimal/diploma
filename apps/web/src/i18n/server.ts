import "server-only";
import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { LOCALE_COOKIE, isLocale, suggestLocale, type Locale } from "./config";
import { createFormat, type Format } from "./format";
import { createVocab, type Vocab } from "./vocab";

/** Server component-д: идэвхтэй хэлний үгсийн сан. Client дээр `useVocab`. */
export async function getVocab(): Promise<Vocab> {
  return createVocab(await getLocale());
}

/** Async server component-д: идэвхтэй хэлний форматлагч. Client дээр `useFormat`. */
export async function getFormat(): Promise<Format> {
  return createFormat(await getLocale());
}

/**
 * Хэл санал болгох banner-т: зочин хэлээ хараахан сонгоогүй бөгөөд түүнд илүү тохирох өөр хэл байвал
 * `{ current, suggested }`. Хадгалсан сонголт (banner-ийг хаасан нь ч мөн адил) байвал дахин асуухгүй.
 */
export async function getLocaleSuggestion(): Promise<{ current: Locale; suggested: Locale } | null> {
  const [cookieStore, headerStore, locale] = await Promise.all([cookies(), headers(), getLocale()]);
  if (cookieStore.has(LOCALE_COOKIE)) return null;
  if (!isLocale(locale)) return null;
  const suggested = suggestLocale({
    current: locale,
    country: headerStore.get("x-vercel-ip-country") ?? headerStore.get("cf-ipcountry"),
    acceptLanguage: headerStore.get("accept-language"),
  });
  return suggested ? { current: locale, suggested } : null;
}
