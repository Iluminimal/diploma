import { useTranslations } from "next-intl";
import { LostPage } from "@/components/layout/lost-page";

export default function NotFound() {
  const t = useTranslations("layout.notFound");
  return (
    <LostPage mark="404" title={t("title")}>
      {t("body")}
    </LostPage>
  );
}
