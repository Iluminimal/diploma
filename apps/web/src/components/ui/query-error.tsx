"use client";

import { Button } from "@/components/ui/button";
import { useUserMessage } from "@/lib/api/use-user-message";

/**
 * Өгөгдөл ачаалж чадаагүй үеийн нэг хэлбэр: хэрэглэгчид ойлгомжтой алдаа, "Дахин оролдох" товч.
 * Admin болон storefront-ийн жагсаалт, дэлгэрэнгүй хуудас нийтлэг.
 */
export function QueryError({ error, onRetry, retryLabel }: { error: unknown; onRetry: () => unknown; retryLabel: string }) {
  const message = useUserMessage();
  return (
    <div className="space-y-3">
      <p role="alert" className="text-destructive-text">
        {message(error)}
      </p>
      <Button variant="outline" onClick={() => void onRetry()}>
        {retryLabel}
      </Button>
    </div>
  );
}
