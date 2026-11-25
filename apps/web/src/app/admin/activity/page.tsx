import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleGate } from "@/features/admin/admin-gate";
import { ActivityLog } from "@/features/admin/activity-views";
import { parseAuditParams } from "@/features/admin/list-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("activity") };
}

export default async function AdminActivity({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <RoleGate allow="admin">
      <ActivityLog params={parseAuditParams(await searchParams)} />
    </RoleGate>
  );
}
