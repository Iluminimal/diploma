"use client";

import { useSyncExternalStore } from "react";
import { Reveal } from "@/components/motion/reveal";
import {
  readRecentlyViewed,
  recentlyViewedOnServer,
  subscribeToRecentlyViewed,
} from "@/features/catalog/recently-viewed";
import { ProductRail } from "@/features/catalog/product-rail";
import { SectionHeading } from "./section-heading";

/** What this visitor looked at last, kept on their device. Nothing for a first visit. */
export function RecentlyViewed() {
  const items = useSyncExternalStore(subscribeToRecentlyViewed, readRecentlyViewed, recentlyViewedOnServer);
  if (items.length === 0) return null;
  return (
    <section className="container-page defer-render pb-16 md:pb-20" aria-label="Recently viewed">
      <Reveal>
        <SectionHeading title="Recently viewed" />
      </Reveal>
      <ProductRail products={items} label="Recently viewed" />
    </section>
  );
}
