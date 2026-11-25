import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleGate } from "@/features/admin/admin-gate";
import { NewProductView } from "@/features/admin/product-views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("newProduct") };
}

export default function NewProductPage() {
  return <RoleGate allow="warehouse"><NewProductView /></RoleGate>;
}
