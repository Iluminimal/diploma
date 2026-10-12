import type { Metadata } from "next";
import { InventoryTable } from "@/features/admin/inventory-views";
import { parseInventoryParams } from "@/features/admin/list-params";

export const metadata: Metadata = { title: "Inventory" };

export default async function AdminInventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  return <InventoryTable params={parseInventoryParams(await searchParams)} />;
}
