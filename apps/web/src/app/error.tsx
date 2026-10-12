"use client";

import { useEffect } from "react";
import { LostPage } from "@/components/layout/lost-page";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <LostPage
      mark="Oops"
      title="Something went wrong"
      actions={
        <Button size="lg" className="h-11 rounded-full px-6" onClick={reset}>
          Try again
        </Button>
      }
    >
      {userMessage(error)}
    </LostPage>
  );
}
