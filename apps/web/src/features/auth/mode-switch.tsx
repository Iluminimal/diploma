"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AuthMode } from "./auth-mode";

const MODES: readonly AuthMode[] = ["login", "register"];

/**
 * "Нэвтрэх | Бүртгүүлэх" сегмент. Хоёр горим нэг endpoint-ийг ашигладаг (код нь шинэ хүнд бүртгэл
 * үүсгэнэ); ялгаа нь зөвхөн урсгал: бүртгүүлэх горим нууц үг асуулгүй шууд код илгээнэ.
 */
export function ModeSwitch({ mode, onChange }: { mode: AuthMode; onChange: (mode: AuthMode) => void }) {
  const t = useTranslations("auth.mode");
  return (
    <div role="tablist" aria-label={t("label")} className="bg-secondary mx-auto grid w-full grid-cols-2 gap-1 rounded-full p-1">
      {MODES.map((value) => {
        const selected = mode === value;
        const other = value === "login" ? "register" : "login";
        return (
          <button
            key={value}
            type="button"
            role="tab"
            id={`auth-mode-${value}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(value)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              onChange(other);
              document.getElementById(`auth-mode-${other}`)?.focus();
            }}
            className={cn(
              "focus-visible:ring-ring/50 rounded-full px-4 py-2 type-caption font-medium outline-none transition-colors focus-visible:ring-3",
              selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(value)}
          </button>
        );
      })}
    </div>
  );
}
