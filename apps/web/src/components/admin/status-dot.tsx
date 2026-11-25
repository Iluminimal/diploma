import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "info" | "neutral" | "danger" | "warning";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  info: "bg-brand",
  neutral: "bg-muted-foreground/60",
  danger: "bg-destructive",
  warning: "bg-warning",
};

/** Төлөвийг өнгөт цэг + үгээр: өнгө ганцаараа утга зөөдөггүй (өнгө ялгаж чадахгүй хүнд ч ойлгомжтой). */
export function StatusDot({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
