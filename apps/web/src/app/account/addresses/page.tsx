import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AddressesView } from "@/features/account/addresses-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.meta");
  return { title: t("addresses") };
}

export default function AddressesPage() {
  return <AddressesView />;
}
