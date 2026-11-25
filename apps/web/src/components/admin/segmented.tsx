"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TRACK = "bg-muted relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-0.5 hide-scrollbar";
const ITEM =
  "focus-visible:ring-ring/50 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3";
const ACTIVE = "bg-background text-foreground shadow-sm";
const IDLE = "text-muted-foreground hover:text-foreground";

export type SegmentItem<K extends string> = {
  key: K;
  label: ReactNode;
  /** Хажууд харагдах тоо (жишээ нь захиалгын тоо). */
  count?: number;
  href?: string;
};

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-muted text-muted-foreground" : "bg-background/70 text-muted-foreground")}>
      {value}
    </span>
  );
}

/**
 * Apple-ийн segmented control, холбоосоор (URL-д төлөв хадгалагддаг жагсаалтын таб, хугацаа). `<nav>`
 * дотор `aria-current="page"`-тай холбоос тул screen reader "одоогийн" сонголтыг мэднэ.
 */
export function SegmentedNav<K extends string>({
  label,
  items,
  value,
  className,
}: {
  label: string;
  items: readonly SegmentItem<K>[];
  value: K;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(TRACK, className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Link key={item.key} href={item.href ?? "#"} aria-current={active ? "page" : undefined} className={cn(ITEM, active ? ACTIVE : IDLE)}>
            {item.label}
            {item.count !== undefined && (
              <>
                {" "}
                <Count value={item.count} active={active} />
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Төлөв нь URL-д биш (жишээ нь хүснэгт/grid харагдац): товчтой segmented control. */
export function SegmentedControl<K extends string>({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: readonly SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn(TRACK, className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button key={item.key} type="button" aria-pressed={active} onClick={() => onChange(item.key)} className={cn(ITEM, active ? ACTIVE : IDLE)}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
