import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductGridSkeleton } from "@/components/product-grid";
import { Reveal } from "@/components/motion/reveal";
import { ScrollFade } from "@/components/motion/scroll-fade";
import { HeroUpload } from "@/features/home/hero-upload";
import { CategoryTiles, NewArrivals, SectionHeading } from "@/features/home/sections";
import { RailSkeleton } from "@/features/catalog/similar-products";
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
      <section className="container-page pt-12 pb-16 text-center md:pt-24 md:pb-24">
        <ScrollFade>
          <p className="text-muted-foreground mb-4 text-sm font-medium">Visual search for fashion</p>
          {/* The page's largest paint: no entrance animation, so it is never held back. */}
          <h1 className="mx-auto max-w-3xl text-4xl leading-[1.04] font-semibold tracking-tighter text-balance sm:text-5xl md:text-7xl">
            Found something you love? Find its lookalikes.
          </h1>
          <Reveal as="p" when="mount" delay={0.15} className="text-muted-foreground mx-auto mt-6 max-w-xl text-base text-balance md:text-lg">
            Drop a photo of any outfit, shoe or bag. We&apos;ll show you similar pieces you can buy today.
          </Reveal>
          <Reveal when="mount" delay={0.3} y={28} className="mx-auto mt-10 max-w-2xl text-left">
            <HeroUpload />
          </Reveal>
        </ScrollFade>
      </section>

      <section className="container-page defer-render pb-16 md:pb-24" aria-label="Departments">
        <Reveal>
          <SectionHeading title="Shop by department" href="/products" linkLabel="All products" />
        </Reveal>
        <Suspense fallback={<ProductGridSkeleton count={4} columns={4} />}>
          <CategoryTiles />
        </Suspense>
      </section>

      <section className="container-page defer-render" aria-label="New arrivals">
        <Reveal>
          <SectionHeading title="New arrivals" href="/products?sort=newest" />
        </Reveal>
        <Suspense fallback={<RailSkeleton />}>
          <NewArrivals />
        </Suspense>
      </section>
    </>
  );
}
