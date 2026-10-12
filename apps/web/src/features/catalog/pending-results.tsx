"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useListingPending } from "./listing-pending";

/**
 * The product grid. When a filter changes the old grid stays on screen, dimmed and not clickable,
 * until the new one arrives, instead of flashing a skeleton.
 */
export function PendingResults({ children }: { children: ReactNode }) {
  const pending = useListingPending((state) => state.pending);
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50")}>
      {children}
    </div>
  );
}
