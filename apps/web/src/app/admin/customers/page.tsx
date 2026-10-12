import type { Metadata } from "next";
import { CustomersTable } from "@/features/admin/customers-views";
import { parseCustomerParams } from "@/features/admin/list-params";

export const metadata: Metadata = { title: "Customers" };

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  return <CustomersTable params={parseCustomerParams(await searchParams)} />;
}
