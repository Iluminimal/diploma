"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale } from "@/i18n/actions";
import { HTML_LANG, LOCALES, NATIVE_NAME, isLocale, type Locale } from "@/i18n/config";

/**
 * Footer дээрх бөмбөрцөг, одоогийн хэл. Дарахад хэлний жагсаалт дээш нээгдэнэ. Сонголт cookie-д
 * хадгалагдаж, одоогийн route шинэ хэлээр дахин зурагдана: URL, scroll, сагс хэвээр.
 */
export function LanguageSwitcher() {
  const t = useTranslations("layout");
  const active = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(save: () => Promise<void>) {
    startTransition(async () => {
      await save();
      router.refresh();
    });
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`${t("language.menu")}: ${NATIVE_NAME[active]}`}
        aria-busy={pending}
        disabled={pending}
        className="text-foreground/80 hover:text-foreground focus-visible:ring-ring/50 data-[state=open]:text-foreground flex items-center gap-1.5 rounded-sm transition-colors outline-none focus-visible:ring-3 disabled:opacity-60"
      >
        <Globe aria-hidden="true" className="size-3.5" />
        <span lang={HTML_LANG[active]}>{NATIVE_NAME[active]}</span>
        <ChevronDown aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={active}
          onValueChange={(value) => isLocale(value) && value !== active && apply(() => setLocale(value))}
          aria-label={t("language.label")}
        >
          {LOCALES.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} lang={HTML_LANG[locale]}>
              {NATIVE_NAME[locale]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
