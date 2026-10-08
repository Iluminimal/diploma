import type { Metadata } from "next";
import { CartView } from "@/features/cart/cart-view";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page py-8 md:py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight md:text-3xl">Your cart</h1>
      <CartView />
    </div>
  );
}
