"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { HEADER_CELL } from "@/components/layout/header-cell";
import { cn } from "@/lib/utils";
import { useBarPanel } from "./bar-panel";

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
 * Pressed, its lines become an X, the rest of the bar fades out and a full page of links opens under
 * it; pressed again (or Escape, or following a link) it closes. After a navigation the menu counts as closed, without
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
  useBarPanel(open);

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
        className={cn(HEADER_CELL, "md:hidden")}
      >
        <MenuIcon open={open} />
      </button>
      {requested && <MobileMenuPanel open={open} onClose={close} trigger={button} />}
    </>
  );
}
