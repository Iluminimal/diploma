import { getTranslations } from "next-intl/server";
import { getLocaleSuggestion } from "@/i18n/server";
import { LocaleBannerClient } from "./locale-banner-client";

/**
 * Apple-ийн "өөр улс/бүс сонгох" banner: хэлээ хараахан сонгоогүй зочинд илүү тохирох хэл байвал
 * хуудасны дээд талд санал болгоно. Бичвэр нь санал болгож буй хэлээр байна: зочин одоогийн хэлийг
 * ойлгохгүй байж магадгүй.
 */
export async function LocaleBanner() {
  const suggestion = await getLocaleSuggestion();
  if (!suggestion) return null;
  const t = await getTranslations({ locale: suggestion.suggested, namespace: "layout.localeBanner" });
  return (
    <LocaleBannerClient
      current={suggestion.current}
      suggested={suggestion.suggested}
      copy={{
        label: t("label"),
        message: t("message"),
        select: t("select"),
        continue: t("continue"),
        close: t("close"),
      }}
    />
  );
}
