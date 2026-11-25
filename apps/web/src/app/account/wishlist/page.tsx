import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WishlistView } from "@/features/wishlist/wishlist-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.meta");
  return { title: t("wishlist") };
}

export default function WishlistPage() {
  return <WishlistView />;
}
