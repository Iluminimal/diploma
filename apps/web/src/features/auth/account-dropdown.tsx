"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useAuthActions } from "./use-auth-actions";

/** The signed-in menu. Loaded on first click (see `AccountMenu`): it needs the dropdown library. */
export function AccountDropdown({ user, defaultOpen }: { user: SessionUser; defaultOpen?: boolean }) {
  const router = useRouter();
  const { signOut } = useAuthActions();

  const leave = async () => {
    try {
      await signOut();
      toast("You're signed out.");
    } catch {
      toast.error("We couldn't reach the server, but you're signed out on this device.");
    }
    router.push("/");
    router.refresh();
  };

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Account: ${user.full_name}`}>
          <UserAvatar user={user} size={28} />
        </Button>
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
