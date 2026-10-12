"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
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
import { useSignOut } from "./use-sign-out";

/** The signed-in menu. Loaded on first click (see `AccountMenu`): it needs the dropdown library. */
export function AccountDropdown({ user, defaultOpen }: { user: SessionUser; defaultOpen?: boolean }) {
  const leave = useSignOut();

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={HEADER_CELL} aria-label={`Account: ${user.full_name}`}>
          <UserAvatar user={user} size={24} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-3">
          <UserAvatar user={user} size={36} />
          <span className="min-w-0 space-y-0.5">
            <span className="block truncate text-sm font-medium">{user.full_name}</span>
            <span className="text-muted-foreground block truncate text-xs font-normal">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon /> {label}
            </Link>
          </DropdownMenuItem>
        ))}
        {user.role === "admin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <LayoutDashboard /> Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void leave()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
