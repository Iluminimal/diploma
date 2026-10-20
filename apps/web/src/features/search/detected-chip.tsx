"use client";

import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api/client";

type Detected = components["schemas"]["DetectedCategory"];

type Props = {
  detected: Detected[];
  /** Хэрэглэгчийн сонгосон ангилал (null = аль ч). */
  value: string | null;
  /** Catalogue дахь бүх article type, "өөр ангилал" сонголтод. */
  allTypes: string[];
  onChange: (articleType: string | null) => void;
};

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className="hover:bg-muted focus-visible:ring-ring/60 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-3"
    >
      {children}
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}

/** "Detected: Shirts" chip. Таамаг нь зөвхөн санал: ангилал сонговол шүүлтүүр болж хэрэгжинэ. */
export function DetectedChip({ detected, value, allTypes, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selectId = useId();
  const top = detected[0];
  if (!top && !value) return null;

  const label = value ? `Category: ${value}` : `Detected: ${top?.article_type}`;
  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. Change category`}
          className={cn(
            "focus-visible:ring-ring/60 inline-flex h-9 max-w-full items-center gap-2 rounded-full border pr-3 pl-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3",
            value ? "border-foreground bg-foreground text-background" : "border-border bg-secondary hover:bg-secondary/70",
          )}
        >
          <Sparkles className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div role="menu" aria-label="Category">
          <Option selected={value === null} onClick={() => choose(null)}>
            <span>Any category</span>
          </Option>
          {detected.map((d) => (
            <Option key={d.category_path} selected={value === d.article_type} onClick={() => choose(d.article_type)}>
              <span className="truncate">{d.article_type}</span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">{Math.round(d.score * 100)}%</span>
            </Option>
          ))}
        </div>
        <div className="border-border mt-1 border-t px-1 pt-3 pb-1">
          <label htmlFor={selectId} className="text-muted-foreground mb-1.5 block px-2 text-xs">
            Another category
          </label>
          <select
            id={selectId}
            value={value && !detected.some((d) => d.article_type === value) ? value : ""}
            onChange={(e) => e.target.value && choose(e.target.value)}
            className="border-input bg-background focus-visible:ring-ring/60 h-10 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-3"
          >
            <option value="">Choose…</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
