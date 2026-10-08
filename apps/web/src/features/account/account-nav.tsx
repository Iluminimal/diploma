"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ACCOUNT_LINKS } from "@/features/auth/account-menu";
import { useAuth } from "@/features/auth/auth-store";

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => {
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
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountGreeting() {
  const user = useAuth((state) => state.user);
  return (
    <p className="text-muted-foreground text-sm">
      {user ? `Signed in as ${user.full_name} (${user.email})` : " "}
    </p>
  );
}
