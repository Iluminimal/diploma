"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useListingPending } from "./listing-pending";

/**
 * Бүтээгдэхүүний grid. Шүүлтүүр солигдоход шинэ нь иртэл хуучин grid дэлгэцэн дээр бүдэг,
 * дарагдахгүй байдлаар үлдэнэ, skeleton анивчихгүй.
 */
export function PendingResults({ children }: { children: ReactNode }) {
  const pending = useListingPending((state) => state.pending);
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50")}>
      {children}
    </div>
  );
}
