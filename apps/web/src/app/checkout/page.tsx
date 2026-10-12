import type { Metadata } from "next";
import { CheckoutView } from "@/features/checkout/checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="container-page py-8 md:py-12">
      <h1 className="type-display mb-8 md:mb-10">Checkout</h1>
      <CheckoutView />
    </div>
  );
}
