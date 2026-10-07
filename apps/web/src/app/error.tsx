"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { userMessage } from "@/lib/api/errors";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page flex flex-col items-center gap-5 py-32 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md text-sm">{userMessage(error)}</p>
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
