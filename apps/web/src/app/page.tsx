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

// Rendered per request: the page reads the catalogue API, which isn't available at build time (CI, Docker).
// The API client's fetch cache (`revalidate`) still keeps these cheap.
export const dynamic = "force-dynamic";

/**
 * The home page is apple.com's: tiles edge to edge, 12px apart, each a headline, a line, a button and
 * a picture. What a shop needs and nothing more: the idea (the photo search), the departments, the new
 * pieces, what delivery is like, and the way back to what the visitor looked at.
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
