"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { LostPage } from "@/components/layout/lost-page";
import { Button } from "@/components/ui/button";
import { useUserMessage } from "@/lib/api/use-user-message";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("layout.error");
  const userMessage = useUserMessage();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <LostPage
      mark={t("mark")}
      title={t("title")}
      actions={
        <Button size="lg" className="h-11 rounded-full px-6" onClick={reset}>
          {t("retry")}
        </Button>
      }
    >
      {userMessage(error)}
    </LostPage>
  );
}
