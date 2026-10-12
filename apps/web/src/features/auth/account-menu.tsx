"use client";

import { HEADER_CELL, PersonGlyph } from "@/components/layout/header-cell";
import { UserAvatar } from "@/components/layout/user-avatar";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-store";

// The dropdown library is only needed once a signed-in shopper opens the menu.
const AccountDropdown = dynamic(() => import("./account-dropdown").then((m) => m.AccountDropdown), { ssr: false });

export function AccountMenu() {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const pathname = usePathname();
  const [requested, setRequested] = useState(false);

  if (status === "unknown") {
    return <span aria-hidden className={HEADER_CELL} />;
  }
  if (status === "signedOut" || !user) {
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <Link href={`/login${next}`} aria-label="Sign in" className={HEADER_CELL}>
        <PersonGlyph />
      </Link>
    );
  }
  // The first click asks for the real menu, which opens itself as soon as it has loaded.
  if (!requested) {
    return (
      <button
        type="button"
        className={HEADER_CELL}
        aria-label={`Account: ${user.full_name}`}
        aria-haspopup="menu"
        onClick={() => setRequested(true)}
      >
        <UserAvatar user={user} size={24} />
      </button>
    );
  }
  return <AccountDropdown user={user} defaultOpen />;
}
