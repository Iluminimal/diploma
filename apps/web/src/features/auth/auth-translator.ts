import type { useTranslations } from "next-intl";

/** `auth` namespace-ийн орчуулагч: client дээр `useTranslations("auth")`, server дээр `getTranslations("auth")`. */
export type AuthTranslator = ReturnType<typeof useTranslations<"auth">>;
