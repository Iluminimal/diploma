"use client";

import { useAuth } from "@/features/auth/auth-store";
import type { StatsPeriod } from "./admin-api";
import { AdminDashboard } from "./dashboard";
import { WarehouseDashboard } from "./warehouse-dashboard";

/** `/admin`: ажилтан бүрийн нүүр. Админ дэлгүүрийн хянах самбар, агуулахын ажилтан илгээх самбар харна. (Нэвтрэлтийг layout-ийн `AdminGate` шалгасан.) */
export function StaffHome({ period }: { period: StatsPeriod }) {
  const role = useAuth((state) => state.user?.role);
  return role === "warehouse" ? <WarehouseDashboard /> : <AdminDashboard period={period} />;
}
