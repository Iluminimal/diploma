import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { geistSans } from "@/features/home/fonts";
import { Departments } from "@/features/home/departments";
import { Hero } from "@/features/home/hero";
import { PhotoTile } from "@/features/home/photo-tile";
import { RecentlyViewed } from "@/features/home/recently-viewed";
import { NewArrivals, PopularNow } from "@/features/home/shelves";
import { JsonLdScripts } from "@/features/seo/json-ld-scripts";
import { siteJsonLd } from "@/features/seo/site-json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home.meta");
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: { canonical: "/" },
    openGraph: { title: t("title"), description: t("description"), url: "/" },
  };
}

// Хүсэлт бүрт render хийнэ: хуудас каталогийн API-г уншдаг бөгөөд build үед (CI, Docker) API
// байдаггүй. API client-ийн fetch cache (`revalidate`) эдгээрийг хямд байлгана.
export const dynamic = "force-dynamic";

/**
 * Нүүр хуудас (GitHub хэв, `.gh`: цайвар анхдагч, Dark үед хар-цэнхэр, нарийн хүрээ, Geist): hero (үг бүр
 * дараалан гарах гарчиг, зургаар хайхын demo), эрэлттэй бараа, гурван department card, зургаар хайх түүх
 * (scroll-той хамт өрнөх алхмууд), шинэ бараа, сүүлд үзсэн. Хөдөлгөөн бүхэлдээ CSS
 * (`styles/effects.css`); hero-ийн агуулга хэзээ ч нуугддаггүй (LCP). Токен: `styles/github.css`.
 */
export default function Home() {
  return (
    <div className={`gh ${geistSans.variable}`}>
      <JsonLdScripts nodes={siteJsonLd()} />
      <Suspense fallback={<div className="min-h-[50rem] lg:min-h-[38rem]" />}>
        <Hero />
      </Suspense>
      <Suspense fallback={null}>
        <PopularNow />
      </Suspense>
      <Suspense fallback={<div className="min-h-[40rem]" />}>
        <Departments />
      </Suspense>
      <Suspense fallback={null}>
        <PhotoTile />
      </Suspense>
      <Suspense fallback={null}>
        <NewArrivals />
      </Suspense>
      <RecentlyViewed />
    </div>
  );
}
