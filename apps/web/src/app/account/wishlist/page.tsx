import type { Metadata } from "next";
import { WishlistView } from "@/features/wishlist/wishlist-view";

export const metadata: Metadata = { title: "Your wishlist" };

export default function WishlistPage() {
  return <WishlistView />;
}
