import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminOrderView } from "@/features/admin/orders-views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("order") };
}

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[number]">) {
  return <AdminOrderView number={(await params).number} />;
}
