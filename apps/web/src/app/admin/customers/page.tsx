import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleGate } from "@/features/admin/admin-gate";
import { CustomersTable } from "@/features/admin/customers-views";
import { parseCustomerParams } from "@/features/admin/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("customers") };
}

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  return <RoleGate allow="admin"><CustomersTable params={parseCustomerParams(await searchParams)} /></RoleGate>;
}
