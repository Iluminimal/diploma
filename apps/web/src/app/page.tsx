import type { Metadata } from "next";
import { Suspense } from "react";
import { Departments } from "@/features/home/departments";
import { Hero } from "@/features/home/hero";
import { PhotoTile } from "@/features/home/photo-tile";
import { RecentlyViewed } from "@/features/home/recently-viewed";
import { Services } from "@/features/home/services";
import { NewArrivals } from "@/features/home/shelves";
import { JsonLdScripts } from "@/features/seo/json-ld-scripts";
import { siteJsonLd } from "@/features/seo/site-json-ld";

const description = "Upload a photo of something you love and find clothing that looks like it.";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { title: "Angel: shop by photo", description, url: "/" },
};

// Хүсэлт бүрт render хийнэ: хуудас каталогийн API-г уншдаг бөгөөд build үед (CI, Docker) API
// байдаггүй. API client-ийн fetch cache (`revalidate`) эдгээрийг хямд байлгана.
export const dynamic = "force-dynamic";

/**
 * Нүүр хуудас apple.com-ийн загвартай: tile-ууд ирмэг хүртэл, 12px зайтай, тус бүр гарчиг, мөр,
 * товч, зурагтай. Дэлгүүрт хэрэгтэй зүйл л байна: санаа (зургаар хайх), department-үүд, шинэ бараа,
 * хүргэлт ямар болох, хэрэглэгч сүүлд үзсэн зүйл рүү буцах зам.
 */
export default function Home() {
  return (
    <div className="space-y-3">
      <JsonLdScripts nodes={siteJsonLd()} />
      <Suspense fallback={<div className="min-h-[36rem] md:min-h-[43rem]" />}>
        <Hero />
      </Suspense>
      <Suspense fallback={null}>
        <Departments />
      </Suspense>
      <PhotoTile />
      <Suspense fallback={null}>
        <NewArrivals />
      </Suspense>
      <Services />
      <RecentlyViewed />
    </div>
  );
}
