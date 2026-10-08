"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_LINKS } from "@/components/nav-links";
import { ACCOUNT_LINKS } from "@/features/auth/account-links";
import { useAuth } from "@/features/auth/auth-store";

/** The slide-out menu on phones. Loaded on first tap (see `MobileNav`): it needs the dialog library. */
export function MobileNavMenu({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const status = useAuth((state) => state.status);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col px-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="border-border border-b py-3.5 text-base font-medium"
            >
              {link.label}
            </Link>
          ))}
          {status === "signedIn" ? (
            ACCOUNT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-border text-muted-foreground border-b py-3.5 text-base"
              >
                {link.label}
              </Link>
            ))
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="border-border text-muted-foreground border-b py-3.5 text-base"
            >
              Sign in
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
