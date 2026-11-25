"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setLocale } from "@/i18n/actions";
import { HTML_LANG, LOCALES, NATIVE_NAME, isLocale, type Locale } from "@/i18n/config";

export type LocaleBannerCopy = {
  label: string;
  message: string;
  select: string;
  continue: string;
  close: string;
};

/**
 * Banner-ийн харагдах хэсэг. "Үргэлжлүүлэх" сонгосон хэлийг хадгална; хаах (✕) нь одоогийн хэлийг
 * хадгална. Аль ч тохиолдолд cookie тавигдах тул banner дахин гарахгүй.
 */
export function LocaleBannerClient({
  current,
  suggested,
  copy,
}: {
  current: Locale;
  suggested: Locale;
  copy: LocaleBannerCopy;
}) {
  const router = useRouter();
  const selectId = useId();
  const [selected, setSelected] = useState<Locale>(suggested);
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function save(locale: Locale) {
    startTransition(async () => {
      await setLocale(locale);
      if (locale === current) setOpen(false);
      else router.refresh();
    });
  }

  function dismiss() {
    setOpen(false);
    void setLocale(current);
  }

  return (
    <section
      aria-label={copy.label}
      lang={HTML_LANG[suggested]}
      aria-busy={pending}
      className="bg-secondary text-foreground border-border relative border-b"
    >
      <div className="container-nav flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="type-fine flex-1 pr-8 type-caption sm:pr-0">{copy.message}</p>
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            {copy.select}
          </label>
          <select
            id={selectId}
            value={selected}
            disabled={pending}
            onChange={(event) => {
              if (isLocale(event.target.value)) setSelected(event.target.value);
            }}
            className="bg-background border-input focus-visible:ring-ring/50 h-8 min-w-36 flex-1 rounded-lg border px-2.5 type-caption outline-none focus-visible:ring-3 sm:flex-none"
          >
            {LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={HTML_LANG[locale]}>
                {NATIVE_NAME[locale]}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={pending} onClick={() => save(selected)}>
            {copy.continue}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={copy.close}
          onClick={dismiss}
          className="absolute top-2 right-2 sm:static"
        >
          <X />
        </Button>
      </div>
    </section>
  );
}
