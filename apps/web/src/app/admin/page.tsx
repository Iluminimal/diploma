import type { Metadata } from "next";
import { AdminDashboard } from "@/features/admin/dashboard";
import { parsePeriod } from "@/features/admin/list-params";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  return <AdminDashboard days={parsePeriod(await searchParams)} />;
}
