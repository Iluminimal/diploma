import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { AdminShopGuard } from "@/features/cart/admin-shop-guard";
import { CheckoutView } from "@/features/checkout/checkout-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("pageTitle"), robots: { index: false } };
}

export default async function CheckoutPage() {
  const t = await getTranslations("checkout");
  return (
    <div className="container-page py-8 md:py-12">
      <h1 className="type-display mb-8 md:mb-10">{t("pageTitle")}</h1>
      <AdminShopGuard>
        <CheckoutView />
      </AdminShopGuard>
    </div>
  );
}
