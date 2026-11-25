import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffHome } from "@/features/admin/staff-home";
import { parsePeriod } from "@/features/admin/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("dashboard") };
}

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  return <StaffHome period={parsePeriod(await searchParams)} />;
}
