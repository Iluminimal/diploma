import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { ConfirmationView } from "@/features/checkout/confirmation-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("confirmationPageTitle"), robots: { index: false } };
}

export default async function ConfirmationPage({ params }: PageProps<"/checkout/confirmation/[number]">) {
  const { number } = await params;
  return (
    <div className="container-page max-w-3xl py-8 md:py-14">
      <ConfirmationView number={number} />
    </div>
  );
}
