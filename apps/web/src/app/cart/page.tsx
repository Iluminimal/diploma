import type { Metadata } from "next";
import { AdminShopGuard } from "@/features/cart/admin-shop-guard";
import { getTranslations } from "next-intl/server";
import { CartView } from "@/features/cart/cart-view";
import { PopularRail } from "@/features/catalog/popular-rail";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart");
  return { title: t("pageTitle"), robots: { index: false } };
}

export default async function CartPage() {
  const t = await getTranslations("cart");
  return (
    <div className="container-page py-8 md:py-12">
      <h1 className="type-display mb-8 md:mb-10">{t("pageHeading")}</h1>
      <AdminShopGuard>
        <CartView />
        <Suspense fallback={null}>
          <PopularRail />
        </Suspense>
      </AdminShopGuard>
    </div>
  );
}
