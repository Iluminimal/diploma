"use client";

import {
  LayoutDashboard,
  Package,
  ScrollText,
  Shirt,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/auth-store";
import { cn } from "@/lib/utils";

type Key = "dashboard" | "orders" | "products" | "customers" | "reviews" | "activity";
type StaffRole = "admin" | "warehouse";

/** `roles`: хэсгийг аль role харах вэ. Админ бараагаа зөвхөн харна, агуулахын ажилтан хэрэглэгч, статистик харахгүй. */
export const ADMIN_LINKS: readonly {
  href: string;
  key: Key;
  icon: LucideIcon;
  group: "store" | "people" | "system";
  roles: readonly StaffRole[];
  exact?: boolean;
}[] = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard, group: "store", roles: ["admin", "warehouse"], exact: true },
  { href: "/admin/orders", key: "orders", icon: Package, group: "store", roles: ["admin", "warehouse"] },
  { href: "/admin/products", key: "products", icon: Shirt, group: "store", roles: ["admin", "warehouse"] },
  { href: "/admin/customers", key: "customers", icon: Users, group: "people", roles: ["admin"] },
  { href: "/admin/reviews", key: "reviews", icon: Star, group: "people", roles: ["admin"] },
  { href: "/admin/activity", key: "activity", icon: ScrollText, group: "system", roles: ["admin"] },
];

const GROUPS = ["store", "people", "system"] as const;

/** Хэсэг бүрийн хажуугийн тоон тэмдэг: "Захиалга" дээр илгээх захиалга, "Бараа" дээр нөөц багатай бараа. */
export type NavBadges = Partial<Record<Key, number>>;

/**
 * Өргөн дэлгэц дээр macOS-ийн sidebar (бүлэгтэй), утсан дээр гүйлгэдэг нэг мөр. НЭГ `<nav>`:
 * хоёр хувилбар render хийвэл screen reader-д давхар landmark гарна.
 */
export function AdminNav({ badges = {} }: { badges?: NavBadges }) {
  const pathname = usePathname();
  const t = useTranslations("admin.nav");
  const role = useAuth((state) => state.user?.role);
  const links = ADMIN_LINKS.filter((link) => (link.roles as readonly string[]).includes(role ?? ""));
  return (
    <nav aria-label={t("label")} className="px-3 pb-2 md:flex-1 md:overflow-y-auto md:py-3">
      <div className="hide-scrollbar relative -mx-1 flex gap-4 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:gap-5 md:overflow-visible md:px-0 md:pb-0">
        {GROUPS.filter((group) => links.some((link) => link.group === group)).map((group) => (
          <div key={group} className="flex shrink-0 gap-1 md:block">
            <p className="text-muted-foreground type-fine hidden px-3 pb-1.5 font-medium md:block">
              {t(group === "store" ? "groupStore" : group === "people" ? "groupPeople" : "groupSystem")}
            </p>
            <ul className="flex gap-1 md:flex-col">
              {links.filter((link) => link.group === group).map(({ href, key, icon: Icon, exact }) => {
                const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                const badge = badges[key];
                return (
                  <li key={href} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 flex h-9 items-center gap-2.5 rounded-full px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 md:rounded-xl md:px-3",
                        current
                          ? "bg-foreground/[0.07] text-foreground"
                          : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-[1.0625rem]", current && "text-brand")} />
                      <span className="flex-1">{t(key)}</span>
                      {badge ? (
                        <span className="bg-brand text-brand-foreground min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums">
                          <span aria-hidden>{badge > 99 ? "99+" : badge}</span>
                          <span className="sr-only">
                            {t(key === "orders" ? "toShip" : "lowStock", { count: badge })}
                          </span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
