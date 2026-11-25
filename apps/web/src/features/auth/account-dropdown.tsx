"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HEADER_CELL } from "@/components/layout/header-cell";
import { UserAvatar } from "@/components/layout/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCOUNT_LINKS } from "./account-links";
import type { SessionUser } from "./auth-store";
import { staffHome } from "./roles";
import { useSignOut } from "./use-sign-out";

/**
 * Нэвтэрсэн хэрэглэгчийн цэс. Эхний товшилтоор ачаална (`AccountMenu`-г хар): dropdown library
 * хэрэгтэй.
 */
export function AccountDropdown({ user, defaultOpen }: { user: SessionUser; defaultOpen?: boolean }) {
  const t = useTranslations();
  const leave = useSignOut();
  const home = staffHome(user.role);

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={HEADER_CELL} aria-label={t("auth.menu.account", { name: user.full_name })}>
          <UserAvatar user={user} size={24} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-3">
          <UserAvatar user={user} size={36} />
          <span className="min-w-0 space-y-0.5">
            <span className="block truncate type-caption font-medium">{user.full_name}</span>
            <span className="text-muted-foreground block truncate type-fine font-normal">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNT_LINKS.map(({ href, key, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon /> {t(`account.nav.${key}`)}
            </Link>
          </DropdownMenuItem>
        ))}
        {home && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={home}>
                <LayoutDashboard /> {t(user.role === "warehouse" ? "auth.menu.warehouse" : "auth.menu.admin")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void leave()}>
          <LogOut /> {t("auth.menu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
