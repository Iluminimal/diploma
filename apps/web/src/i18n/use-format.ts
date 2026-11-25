import { useLocale } from "next-intl";
import { createFormat, type Format } from "./format";

/** Идэвхтэй хэлний форматлагч (server болон client component-д). Async server component-д `getFormat`. */
export function useFormat(): Format {
  return createFormat(useLocale());
}
