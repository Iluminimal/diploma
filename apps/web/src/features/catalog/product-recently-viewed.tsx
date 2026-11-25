"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { ProductRail } from "./product-rail";
import { readRecentlyViewed, recentlyViewedOnServer, subscribeToRecentlyViewed } from "./recently-viewed";

/** Барааны хуудасны доорх "Саяхан үзсэн": одоогийн барааг оруулахгүй, өөр юу ч үзээгүй бол нуугдана. */
export function ProductRecentlyViewed({ excludeId }: { excludeId: number }) {
  const t = useTranslations("catalog");
  const all = useSyncExternalStore(subscribeToRecentlyViewed, readRecentlyViewed, recentlyViewedOnServer);
  const items = all.filter((product) => product.id !== excludeId);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading" className="defer-render mt-20">
      <h2 id="recent-heading" className="type-title mb-6 md:mb-8">
        {t("recentlyViewed")}
      </h2>
      <ProductRail products={items} label={t("recentlyViewed")} />
    </section>
  );
}
