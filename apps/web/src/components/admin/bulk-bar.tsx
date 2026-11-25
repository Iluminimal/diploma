"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Мөр сонгосны дараа доор гарч ирэх хөвөгч үйлдлийн мөр (macOS-ийн хөвөгч toolbar). Сонголт
 * байхгүй бол юу ч render хийхгүй.
 */
export function BulkBar({
  count,
  label,
  clearLabel,
  onClear,
  children,
}: {
  count: number;
  /** "3 сонгосон" мэт, дуудагч орчуулна. */
  label: string;
  clearLabel: string;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        role="region"
        aria-label={label}
        className="bg-popover/85 pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-full px-3 py-2 shadow-[var(--elevation-soft)] ring-1 ring-[var(--admin-hairline)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out-expo"
      >
        <Button type="button" variant="ghost" size="icon-sm" aria-label={clearLabel} onClick={onClear}>
          <X aria-hidden />
        </Button>
        <span aria-live="polite" className="px-1 text-sm font-medium tabular-nums">
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}
