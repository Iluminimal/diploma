import type en from "../../messages/en";
import type { Locale } from "./config";

// Орчуулгын түлхүүр бүр compile үед шалгагдана: `t("typo")` алдаа өгнө. `en.json` нь эх үүсвэр.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
