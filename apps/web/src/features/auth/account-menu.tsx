"use client";

import { User } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-store";

// The dropdown library is only needed once a signed-in shopper opens the menu.
const AccountDropdown = dynamic(() => import("./account-dropdown").then((m) => m.AccountDropdown), { ssr: false });

export function AccountMenu() {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const pathname = usePathname();
  const [requested, setRequested] = useState(false);

  if (status === "unknown") {
    return <span aria-hidden className="bg-muted size-8 animate-pulse rounded-lg" />;
  }
  if (status === "signedOut" || !user) {
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <Button asChild variant="ghost" size="icon" aria-label="Sign in">
        <Link href={`/login${next}`}>
          <User />
        </Link>
      </Button>
    );
  }
  // The first click asks for the real menu, which opens itself as soon as it has loaded.
  if (!requested) {
    return (
      <Button variant="ghost" size="icon" aria-label={`Account: ${user.full_name}`} aria-haspopup="menu" onClick={() => setRequested(true)}>
        <User />
      </Button>
    );
  }
  return <AccountDropdown user={user} defaultOpen />;
}
