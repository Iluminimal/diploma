"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dialog } from "radix-ui";
import type { RefObject } from "react";
import { HEADER_CELL } from "@/components/layout/header-cell";
import { AngelLogo } from "@/components/layout/logo";
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
 * its own (logo and close), the title in large type and the items in a centred column. Loaded on first
 * open (see `CartButton`): the dialog library is not needed to show a bag icon.
 */
export function BagPanel({ open, onOpenChange, count, trigger }: Props) {
  const close = () => onOpenChange(false);
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
                className="focus-visible:ring-ring/60 rounded-md text-[1.0625rem] outline-none focus-visible:ring-3"
              >
                <AngelLogo showName={false} markClassName="size-7" />
              </Link>
              <Dialog.Close className={HEADER_CELL} aria-label="Close Bag">
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
