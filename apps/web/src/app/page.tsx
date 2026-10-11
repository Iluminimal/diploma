import type { Metadata } from "next";
import { Suspense } from "react";
import { DepartmentShowcase } from "@/features/home/department-showcase";
import { Hero } from "@/features/home/hero";
import { HowItWorks } from "@/features/home/how-it-works";
import { PhotoCta } from "@/features/home/photo-cta";
import { RecentlyViewed } from "@/features/home/recently-viewed";
import { BasicShelves, CategoryPills, PopularShelves } from "@/features/home/shelves";
import { TrustStrip } from "@/features/home/trust-strip";
import { JsonLdScripts } from "@/features/seo/json-ld-scripts";
import { siteJsonLd } from "@/features/seo/site-json-ld";

const description = "Upload a photo of something you love and find clothing that looks like it.";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { title: "Lookalike: shop by photo", description, url: "/" },
};

// Rendered per request: the page reads the catalogue API, which isn't available at build time (CI, Docker).
// The API client's fetch cache (`revalidate`) still keeps these cheap.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <JsonLdScripts nodes={siteJsonLd()} />
      <Suspense fallback={<div className="min-h-[70dvh]" />}>
        <Hero />
      </Suspense>
      <Suspense fallback={null}>
        <HowItWorks />
      </Suspense>
      <Suspense fallback={null}>
        <DepartmentShowcase />
      </Suspense>
      <Suspense fallback={null}>
        <CategoryPills />
      </Suspense>
      <BasicShelves />
      <Suspense fallback={null}>
        <PopularShelves />
      </Suspense>
      <RecentlyViewed />
      <PhotoCta />
      <TrustStrip />
    </>
  );
}
