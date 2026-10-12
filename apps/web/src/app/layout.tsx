import type { Metadata, Viewport } from "next";
import { ShopChrome } from "@/components/layout/shop-chrome";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Angel: shop by photo", template: "%s · Angel" },
  description: "Upload a photo of something you love and find clothing that looks like it.",
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Next turns smooth scrolling off for the instant of a route change when it sees this.
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-lg px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-3"
        >
          Skip to content
        </a>
        <Providers>
          <ShopChrome header={<SiteHeader />} footer={<SiteFooter />}>
            {children}
          </ShopChrome>
        </Providers>
      </body>
    </html>
  );
}
