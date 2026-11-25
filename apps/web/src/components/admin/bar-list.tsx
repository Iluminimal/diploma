import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Bar = {
  key: string;
  label: ReactNode;
  /** Баарын урт: хамгийн их утгад харьцуулсан. */
  value: number;
  /** Баарын баруун талд бичигдэх үнэн утга (тоо, мөнгө). */
  display: ReactNode;
  /** Нэмэлт тайлбар (жишээ нь хувь). */
  hint?: ReactNode;
  className?: string;
};

/**
 * Хэвтээ баартай жагсаалт (funnel, ангиллаарх борлуулалт). Утга бүр текстээр бичигдсэн тул screen
 * reader-д тусдаа хүснэгт хэрэггүй; баар нь зөвхөн харагдах харьцуулалт.
 */
export function BarList({ bars, label, className }: { bars: readonly Bar[]; label: string; className?: string }) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  return (
    <ul aria-label={label} className={cn("space-y-3", className)}>
      {bars.map((bar) => (
        <li key={bar.key} className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{bar.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {bar.display}
              {bar.hint && <span className="text-muted-foreground ml-1.5 text-xs font-normal">{bar.hint}</span>}
            </span>
          </div>
          <div aria-hidden className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className={cn("bg-brand h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", bar.className)}
              style={{ width: `${max > 0 ? Math.max((bar.value / max) * 100, bar.value > 0 ? 2 : 0) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
