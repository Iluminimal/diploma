import type { useTranslations } from "next-intl";

/** `orders` namespace-ийн орчуулагч. */
export type OrdersTranslator = ReturnType<typeof useTranslations<"orders">>;
