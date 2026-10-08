import type { Metadata } from "next";
import { NewProductView } from "@/features/admin/product-views";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return <NewProductView />;
}
