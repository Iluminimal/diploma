import type { Metadata } from "next";
import { CheckoutView } from "@/features/checkout/checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <div className="container-page py-8 md:py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight md:text-3xl">Checkout</h1>
      <CheckoutView />
    </div>
  );
}
