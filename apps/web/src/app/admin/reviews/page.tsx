import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleGate } from "@/features/admin/admin-gate";
import { parseReviewParams } from "@/features/admin/list-params";
import { ReviewsList } from "@/features/admin/reviews-views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("reviews") };
}

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return <RoleGate allow="admin"><ReviewsList params={parseReviewParams(await searchParams)} /></RoleGate>;
}
