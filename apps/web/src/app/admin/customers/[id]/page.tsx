import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerView } from "@/features/admin/customers-views";

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <CustomerView id={id} />;
}
