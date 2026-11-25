import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { BarCurtain } from "@/components/layout/bar-curtain";
import { CardTilt } from "@/components/motion/card-tilt";
import { LocaleBanner } from "@/components/layout/locale-banner";
import { ShopChrome } from "@/components/layout/shop-chrome";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeScript } from "@/components/theme/theme-script";
import { HTML_LANG, OG_LOCALE, type Locale } from "@/i18n/config";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { Providers } from "./providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("layout.meta")]);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
    openGraph: { siteName: SITE_NAME, type: "website", locale: OG_LOCALE[locale as Locale] },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, t, requestHeaders] = await Promise.all([getLocale(), getTranslations("layout"), headers()]);
  // CSP nonce (src/proxy.ts): inline theme script-ийг зөвшөөрөгдсөн болгоно.
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  return (
    <html
      lang={HTML_LANG[locale as Locale]}
      suppressHydrationWarning
      // Энэ attribute-ыг харвал Next route солигдох агшинд smooth scroll-ийг түр унтраадаг.
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-3"
        >
          {t("skip")}
        </a>
        <BarCurtain />
        <CardTilt />
        <NextIntlClientProvider>
          <Providers>
            <ShopChrome banner={<LocaleBanner />} header={<SiteHeader />} footer={<SiteFooter />}>
              {children}
            </ShopChrome>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
