import { useTranslations } from "next-intl";
import { createUserMessage, type ErrorTranslator } from "./errors";

/** Идэвхтэй хэлээр алдааны мессеж гаргах функц: `const message = useUserMessage(); message(error)`. */
export function useUserMessage(): (error: unknown) => string {
  return createUserMessage(useTranslations("errors") as unknown as ErrorTranslator);
}
