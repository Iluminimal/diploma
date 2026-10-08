"use client";

import { Package, Shirt } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/products", label: "Products", icon: Shirt },
  { href: "/admin/orders", label: "Orders", icon: Package },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/60 inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
              current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
