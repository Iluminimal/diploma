import type { Locale } from "./config";
import { MN_CATEGORY, MN_COLOUR, MN_DEPARTMENT, MN_GENDER, MN_SEASON, MN_USAGE } from "./vocab-mn";

export type Vocab = {
  department: (name: string) => string;
  gender: (name: string) => string;
  colour: (name: string) => string;
  season: (name: string) => string;
  usage: (name: string) => string;
  /** Бүлэг, дэд ангилал, article type. */
  category: (name: string) => string;
};

const TABLES = {
  en: null,
  mn: {
    department: MN_DEPARTMENT,
    gender: MN_GENDER,
    colour: MN_COLOUR,
    season: MN_SEASON,
    usage: MN_USAGE,
    category: MN_CATEGORY,
  },
} as const satisfies Record<Locale, Record<keyof Vocab, Record<string, string>> | null>;

const cache = new Map<string, Vocab>();

/**
 * Dataset-ийн англи нэрийг (ангилал, өнгө, хүйс...) тухайн хэл рүү хөрвүүлнэ. Орчуулгагүй утга
 * (шинэ ангилал, мэдэгдэхгүй өнгө) англиараа үлдэнэ, хоосон биш. Бүтээгдэхүүний нэр, тайлбар энд
 * ордоггүй: тэд API-аас ирсэн хэвээрээ.
 */
export function createVocab(locale: Locale | string): Vocab {
  const cached = cache.get(locale);
  if (cached) return cached;
  const vocab = build(locale);
  cache.set(locale, vocab);
  return vocab;
}

function build(locale: string): Vocab {
  const tables = locale in TABLES ? TABLES[locale as Locale] : null;
  const pick = (kind: keyof Vocab) => (name: string) =>
    (tables && Object.hasOwn(tables[kind], name) ? tables[kind][name] : undefined) ?? name;
  return {
    department: pick("department"),
    gender: pick("gender"),
    colour: pick("colour"),
    season: pick("season"),
    usage: pick("usage"),
    category: pick("category"),
  };
}
