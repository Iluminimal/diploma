import { useLocale } from "next-intl";
import { createVocab, type Vocab } from "./vocab";

/** Идэвхтэй хэлний үгсийн сан (server болон client component-д). Async server component-д `getVocab` (`./server`). */
export function useVocab(): Vocab {
  return createVocab(useLocale());
}
