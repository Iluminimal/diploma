"use client";

import { Heart, LayoutDashboard, LogOut, MapPin, Package, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "./auth-store";
import { useAuthActions } from "./use-auth-actions";

export const ACCOUNT_LINKS = [
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
] as const;

export function AccountMenu() {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuthActions();

  if (status === "unknown") {
    return (
      <span aria-hidden className="bg-muted size-8 animate-pulse rounded-lg" />
    );
  }
  if (status === "signedOut" || !user) {
    const next =
      pathname && pathname !== "/"
        ? `?next=${encodeURIComponent(pathname)}`
        : "";
    return (
      <Button asChild variant="ghost" size="icon" aria-label="Sign in">
        <Link href={`/login${next}`}>
          <User />
        </Link>
      </Button>
    );
  }

  const leave = async () => {
    try {
      await signOut();
      toast("You're signed out.");
    } catch {
      toast.error(
        "We couldn't reach the server, but you're signed out on this device.",
      );
    }
    router.push("/");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Account: ${user.full_name}`}
        >
          <User />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate text-sm font-medium">
            {user.full_name}
          </span>
          <span className="text-muted-foreground block truncate text-xs font-normal">
            {user.email}
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
              <Link href="/admin/products">
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
