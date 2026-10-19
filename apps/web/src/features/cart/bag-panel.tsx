"use client";

import { LogIn, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dialog } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import { useBarPanel } from "@/components/layout/bar-panel";
import { HEADER_CELL } from "@/components/layout/header-cell";
import { AngelLogo } from "@/components/layout/logo";
import { ACCOUNT_LINKS } from "@/features/auth/account-links";
import { useAuth } from "@/features/auth/auth-store";
import { cn } from "@/lib/utils";
import { MiniCartSkeleton } from "./mini-cart";

// The panel's list, steppers and mutations are only fetched when someone opens it.
const MiniCart = dynamic(() => import("./mini-cart").then((m) => m.MiniCart), {
  ssr: false,
  loading: () => <MiniCartSkeleton />,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** The button that opens the panel: focus goes back to it on close. */
  trigger: RefObject<HTMLButtonElement | null>;
};

/**
 * The Bag, as on apple.com: a solid page that opens over the whole screen from the top, with a bar of
 * its own (on a phone only the close button, as the header's other buttons are gone; from md up the logo
 * too), the title in large type, the items in a centred column and, under them, the profile links (the
 * account lives here, not in the phone menu). Loaded on first open (see `CartButton`): the dialog
 * library is not needed to show a bag icon.
 */
export function BagPanel({ open, onOpenChange, count, trigger }: Props) {
  const close = () => onOpenChange(false);
  useBarPanel(open);
  const signedIn = useAuth((state) => state.status === "signedIn");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          className="bg-background fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain outline-none duration-300 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-4"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <div className="container-page w-full">
            <div className="flex h-12 items-center justify-between">
              <Link
                href="/"
                onClick={close}
                className="focus-visible:ring-ring/60 rounded-md text-[1.0625rem] outline-none focus-visible:ring-3 max-md:hidden"
              >
                <AngelLogo showName={false} markClassName="size-7" />
              </Link>
              <Dialog.Close className={cn(HEADER_CELL, "ml-auto")} aria-label="Close Bag">
                <X className="size-[18px]" strokeWidth={1.25} />
              </Dialog.Close>
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6 pb-16 md:pt-10">
            <Dialog.Title className="type-display mb-8">
              Bag
              {count > 0 && <span className="text-muted-foreground ml-3 font-normal">{count}</span>}
            </Dialog.Title>
            <Dialog.Description className="sr-only">Items you have added, with quantities and subtotal.</Dialog.Description>
            <MiniCart onNavigate={close} />
            <nav aria-label="My profile" className="border-border mt-12 border-t pt-8">
              <p className="text-muted-foreground mb-3 text-sm">My profile</p>
              <ul className="space-y-1">
                {signedIn ? (
                  ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
                    <li key={href}>
                      <ProfileLink href={href} onClick={close}>
                        <Icon aria-hidden className="text-muted-foreground size-4" /> {label}
                      </ProfileLink>
                    </li>
                  ))
                ) : (
                  <li>
                    <ProfileLink href="/login" onClick={close}>
                      <LogIn aria-hidden className="text-muted-foreground size-4" /> Sign in
                    </ProfileLink>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One line of the profile list: a small icon and the name in semibold type, as under apple.com's Bag. */
function ProfileLink({ href, onClick, children }: { href: string; onClick: () => void; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      // Account pages answer a signed-out visitor with a redirect: prefetched, that answer would be replayed after sign-in.
      prefetch={false}
      className="hover:text-brand focus-visible:ring-ring/60 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-lg font-semibold tracking-tight outline-none transition-colors focus-visible:ring-3"
    >
      {children}
    </Link>
  );
}
