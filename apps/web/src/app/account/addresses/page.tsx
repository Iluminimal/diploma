import type { Metadata } from "next";
import { AddressesView } from "@/features/account/addresses-view";

export const metadata: Metadata = { title: "Your addresses" };

export default function AddressesPage() {
  return <AddressesView />;
}
