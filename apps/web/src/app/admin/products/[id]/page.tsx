import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditProductView } from "@/features/admin/product-views";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <EditProductView id={id} />;
}
