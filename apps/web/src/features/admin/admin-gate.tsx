"use client";

import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { isStaffRole, staffHome, type Role } from "@/features/auth/roles";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Admin дэлгэцийг ажилтнаас (админ, агуулахын ажилтан) бусдад хаана. Энэ нь зочинд ойлгомжтой
 * мессеж үзүүлэхийн тулд (хүсэлт алдаа өгөхийн оронд); бодитоор татгалздаг нь API.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.gate");
  const status = useAuth((state) => state.status);
  const role = useAuth((state) => state.user?.role);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "signedIn") {
    return (
      <main id="main" tabIndex={-1} className="container-page flex-1 py-10 outline-none">
        <Skeleton aria-busy aria-label={t("checking")} className="h-64 rounded-[var(--radius-tile)]" />
      </main>
    );
  }
  if (!isStaffRole(role)) {
    return (
      <main id="main" tabIndex={-1} className="container-page flex-1 outline-none">
        <NoAccess body={t("noAccessBody")} href="/" label={t("back")} />
      </main>
    );
  }
  return <>{children}</>;
}

/**
 * Нэг хэсгийг зөвхөн нэг role-д нээнэ (жишээ нь хэрэглэгч, статистик нь админд, шинэ бараа нь
 * агуулахын ажилтанд). `AdminGate` нэвтрэлтийг аль хэдийн шалгасан тул зөвхөн role-ийг шалгана; API мөн
 * 403 өгнө.
 */
export function RoleGate({ allow, children }: { allow: Exclude<Role, "customer">; children: ReactNode }) {
  const t = useTranslations("admin.gate");
  const role = useAuth((state) => state.user?.role);
  if (role === allow) return <>{children}</>;
  return <NoAccess body={t("wrongRoleBody")} href={staffHome(role) ?? "/"} label={t("backToWork")} />;
}

function NoAccess({ body, href, label }: { body: string; href: string; label: string }) {
  const t = useTranslations("admin.gate");
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <span className="bg-muted grid size-14 place-items-center rounded-full">
        <ShieldAlert aria-hidden className="text-muted-foreground size-6" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-medium">{t("noAccessTitle")}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      <Button asChild variant="outline" size="lg">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
