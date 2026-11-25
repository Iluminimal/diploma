"use client";

import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useVocab } from "@/i18n/use-vocab";
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
      className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left type-caption outline-none focus-visible:ring-3"
    >
      {children}
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}

/** "Detected: Shirts" chip. Таамаг нь зөвхөн санал: ангилал сонговол шүүлтүүр болж хэрэгжинэ. */
export function DetectedChip({ detected, value, allTypes, onChange }: Props) {
  const t = useTranslations("search.detected");
  const vocab = useVocab();
  const [open, setOpen] = useState(false);
  const selectId = useId();
  const top = detected[0];
  if (!top && !value) return null;

  const label = value
    ? t("category", { name: vocab.category(value) })
    : t("detected", { name: vocab.category(top?.article_type ?? "") });
  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("change", { label })}
          className={cn(
            "focus-visible:ring-ring/50 inline-flex h-9 max-w-full items-center gap-2 rounded-full border pr-3 pl-3.5 type-caption font-medium outline-none transition-colors focus-visible:ring-3",
            value ? "border-foreground bg-foreground text-background" : "border-border bg-secondary hover:bg-secondary/70",
          )}
        >
          <Sparkles className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div role="menu" aria-label={t("menu")}>
          <Option selected={value === null} onClick={() => choose(null)}>
            <span>{t("any")}</span>
          </Option>
          {detected.map((d) => (
            <Option key={d.category_path} selected={value === d.article_type} onClick={() => choose(d.article_type)}>
              <span className="truncate">{vocab.category(d.article_type)}</span>
              <span className="text-muted-foreground ml-auto type-fine tabular-nums">{Math.round(d.score * 100)}%</span>
            </Option>
          ))}
        </div>
        <div className="border-border mt-1 border-t px-1 pt-3 pb-1">
          <label htmlFor={selectId} className="text-muted-foreground mb-1.5 block px-2 type-fine">
            {t("another")}
          </label>
          <select
            id={selectId}
            value={value && !detected.some((d) => d.article_type === value) ? value : ""}
            onChange={(e) => e.target.value && choose(e.target.value)}
            className="border-input bg-background focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 type-caption outline-none focus-visible:ring-3"
          >
            <option value="">{t("choose")}</option>
            {allTypes.map((type) => (
              <option key={type} value={type}>
                {vocab.category(type)}
              </option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
