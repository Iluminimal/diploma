import type { Metadata } from "next";
import { ConfirmationView } from "@/features/checkout/confirmation-view";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

export default async function ConfirmationPage({ params }: PageProps<"/checkout/confirmation/[number]">) {
  const { number } = await params;
  return (
    <div className="container-page max-w-3xl py-8 md:py-14">
      <ConfirmationView number={number} />
    </div>
  );
}
