"use client";

import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { staffHome } from "@/features/auth/roles";

/** Ажилтанд (админ, агуулахын ажилтан) "Add to bag"-ийн оронд: яагаад худалдан авч болохгүйг тайлбарлаж, самбар руу чиглүүлнэ. */
export function AdminNotice() {
  const t = useTranslations("cart");
  const home = useAuth((state) => staffHome(state.user?.role)) ?? "/admin";
  return (
    <div className="bg-muted/50 space-y-3 rounded-2xl border p-4">
      <p className="text-muted-foreground type-caption">{t("adminNotice")}</p>
      <Button asChild variant="outline" size="lg" className="w-full">
        <Link href={home}>
          <LayoutDashboard /> {t("adminPanel")}
        </Link>
      </Button>
    </div>
  );
}
