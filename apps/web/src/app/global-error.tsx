"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";
import en from "../../messages/en/layout.json";
import mn from "../../messages/mn/layout.json";
import "./globals.css";

const COPY = { en: en.error, mn: mn.error } as const;

// Layout (тэгэхлээр provider ч) унасан тул хэлийг cookie-оос шууд уншина (үгүй бол монгол). Server дээр мөн монгол:
// hydration-д `useSyncExternalStore` хоёр хувилбарыг зөв тааруулна.
function readLocale(): Locale {
  const saved = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
}
const subscribe = () => () => {};

/**
 * Сүүлчийн арга: layout өөрөө алдаа гарвал root layout-ийг оруулаад бүх хуудсыг орлоно. Тиймээс
 * өөрийн <html> ба <body>-тэй, layout-д байдаг юуг ч ашигладаггүй.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const locale = useSyncExternalStore(subscribe, readLocale, () => DEFAULT_LOCALE);
  const copy = COPY[locale];

  return (
    <html lang={locale}>
      <body className="bg-background text-foreground grid min-h-dvh place-items-center p-6 text-center antialiased">
        <div className="max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-muted-foreground type-caption">{copy.globalBody}</p>
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-primary-foreground h-11 rounded-full px-6 type-caption font-medium"
          >
            {copy.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
