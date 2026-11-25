import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleGate } from "@/features/admin/admin-gate";
import { notFound } from "next/navigation";
import { CustomerView } from "@/features/admin/customers-views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("customer") };
}

export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <RoleGate allow="admin"><CustomerView id={id} /></RoleGate>;
}
