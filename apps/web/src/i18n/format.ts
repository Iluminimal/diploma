import { BASE_CURRENCY, formatMoney } from "./currency";
import { INTL_LOCALE, isLocale, DEFAULT_LOCALE } from "./config";

/** Тоо, мөнгө, огноог идэвхтэй хэлээр форматлана. Үнэ төгрөгөөр, хөрвүүлэлтгүй. */
const cache = new Map<string, Format>();

export function createFormat(locale: string): Format {
  const cached = cache.get(locale);
  if (cached) return cached;
  const format = build(locale);
  cache.set(locale, format);
  return format;
}

function build(locale: string) {
  const tag = INTL_LOCALE[isLocale(locale) ? locale : DEFAULT_LOCALE];
  return {
    /** Бага нэгжээр (төгрөг x 100) ирсэн үнийг харуулна; өөр валют (хуучин захиалга) өгч болно. */
    price: (minor: number, currency: string = BASE_CURRENCY) => formatMoney(minor, currency, tag),
    number: (value: number) => value.toLocaleString(tag),
    date: (value: string | number | Date, options: Intl.DateTimeFormatOptions) =>
      new Date(value).toLocaleDateString(tag, options),
    dateTime: (value: string | number | Date, options: Intl.DateTimeFormatOptions) =>
      new Date(value).toLocaleString(tag, options),
    /** Үгсийг хэлний дарааллаар эрэмбэлэх (`localeCompare`). */
    compare: (a: string, b: string) => a.localeCompare(b, tag),
  };
}

export type Format = ReturnType<typeof build>;
