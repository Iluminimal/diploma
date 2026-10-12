import type { Metadata } from "next";
import { CartView } from "@/features/cart/cart-view";

export const metadata: Metadata = { title: "Your Bag", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page py-8 md:py-12">
      <h1 className="type-display mb-8 md:mb-10">Review your Bag.</h1>
      <CartView />
    </div>
  );
}
