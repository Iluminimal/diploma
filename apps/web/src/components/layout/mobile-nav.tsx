"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// The menu panel (with the categories it fetches) is loaded the first time the button is pressed.
const MobileMenuPanel = dynamic(() => import("./mobile-nav-menu").then((m) => m.MobileMenuPanel), { ssr: false });

/** Two thin lines that turn into an X, like the menu button on apple.com. */
function MenuIcon({ open }: { open: boolean }) {
  const line = "absolute left-0 h-px w-full rounded-full bg-current transition-transform duration-300 ease-out-expo";
  return (
    <span aria-hidden className="relative block h-[12px] w-[17px]">
      <span className={cn(line, "top-[3px]", open && "translate-y-[3px] rotate-45")} />
      <span className={cn(line, "top-[9px]", open && "-translate-y-[3px] -rotate-45")} />
    </span>
  );
}

/**
 * The menu button of the phone header, last in the row (logo, search, bag, menu) as on apple.com.
 * Pressed, its lines become an X and a full page of links opens under the bar; pressed again (or
 * Escape, or following a link) it closes. After a navigation the menu counts as closed, without
 * an effect: it remembers the page it was opened on.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const open = openedAt !== null && openedAt === pathname;
  // Stable: the panel's effect depends on it and must not run again at every render.
  const close = useCallback(() => setOpenedAt(null), []);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => {
          setRequested(true);
          setOpenedAt(open ? null : pathname);
        }}
        className="focus-visible:ring-ring/60 hover:bg-muted/60 grid size-11 place-items-center rounded-full outline-none transition-colors focus-visible:ring-3 md:hidden"
      >
        <MenuIcon open={open} />
      </button>
      {requested && <MobileMenuPanel open={open} onClose={close} trigger={button} />}
    </>
  );
}
