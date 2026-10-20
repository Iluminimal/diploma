"use client";

import {
  LayoutDashboard,
  Package,
  Shirt,
  Star,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const ADMIN_LINKS: readonly {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/products", label: "Products", icon: Shirt },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
];

/** Өргөн дэлгэц дээр sidebar, утсан дээр гүйлгэдэг pill-үүдийн мөр. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="px-2 pb-2 md:flex-1 md:px-3 md:py-2">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
        {ADMIN_LINKS.map(({ href, label, icon: Icon, exact }) => {
          const current = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/60 flex h-10 items-center gap-2.5 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 md:rounded-xl md:px-3",
                  current
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
