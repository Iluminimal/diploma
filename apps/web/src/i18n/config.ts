export const LOCALES = ["en", "mn"] as const;
export type Locale = (typeof LOCALES)[number];

// Монгол эхэнд: cookie-гүй бүх зочин монголоор харна (хөтчийн хэлийг тоохгүй); англи хэл нь сольсоор.
export const DEFAULT_LOCALE: Locale = "mn";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** `<html lang>`-д ба Intl-д очих BCP 47 tag. Орчуулгын файлын нэр (`mn`) нь тэр хэвээрээ. */
export const HTML_LANG: Record<Locale, string> = { en: "en", mn: "mn" };

/** `Intl`, `toLocaleString`-д өгөх BCP 47 tag. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", mn: "mn-MN" };

/** Open Graph-ийн `og:locale` (`language_TERRITORY`). */
export const OG_LOCALE: Record<Locale, string> = { en: "en_US", mn: "mn_MN" };

/** Хэл бүр өөрийн хэлээрээ нэрлэгдэнэ: хүн ойлгохгүй хэл дээрээс өөрийнхөө хэлийг олж чадах ёстой. */
export const NATIVE_NAME: Record<Locale, string> = { en: "English", mn: "Монгол" };

/**
 * `Accept-Language` толгойгоос манай дэмждэг хэлнүүдийг q-ийн дарааллаар (тэнцүү бол толгой дахь
 * дарааллаар), давхардалгүй буцаана. `mn`, `mn-MN`, `mn-Cyrl` бүгд `mn`; q=0 нь татгалзсан хэл.
 */
export function rankLocales(header: string | null | undefined): Locale[] {
  if (!header) return [];
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const result: Locale[] = [];
  for (const { tag } of ranked) {
    const language = tag.split("-")[0];
    if (isLocale(language) && !result.includes(language)) result.push(language);
  }
  return result;
}

/** Улсын код (ISO 3166-1 alpha-2) -> тухайн улсад санал болгох хэл. */
const COUNTRY_LOCALE: Partial<Record<string, Locale>> = { MN: "mn" };

/**
 * Apple-ийн "өөр хэл/бүс сонгох уу?" banner-ийн шийдвэр. Зочин хэл сонгоогүй (cookie байхгүй) үед л
 * дуудагдана. Эхлээд байршил (CDN-ийн улсын толгой), дараа нь хөтчийн хэлний жагсаалтаас одоогийнхоос
 * өөр дэмждэг хэлийг санал болгоно. Санал болгох зүйлгүй бол `null`.
 */
export function suggestLocale({
  current,
  country,
  acceptLanguage,
}: {
  current: Locale;
  country?: string | null;
  acceptLanguage?: string | null;
}): Locale | null {
  const byCountry = country ? COUNTRY_LOCALE[country.trim().toUpperCase()] : undefined;
  if (byCountry) return byCountry === current ? null : byCountry;
  return rankLocales(acceptLanguage).find((locale) => locale !== current) ?? null;
}
