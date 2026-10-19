import { useEffect } from "react";

/** The pages that open under the bar from md up: the category menu, the search and the Bag. */
export type Flyout = "menu" | "search" | "bag";

const EVENT = "bar-flyout";

/** Says that `flyout` has just opened. Any other one that is open closes (see `useCloseOnOtherFlyout`). */
export function announceFlyout(flyout: Flyout | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: flyout }));
}

/**
 * One flyout at a time, as on apple.com: opening the search closes the Bag, hovering a department
 * replaces the search, and so on. Each flyout owns its own state and calls this with its own name.
 */
export function useCloseOnOtherFlyout(self: Flyout, close: () => void) {
  useEffect(() => {
    function onOther(event: Event) {
      if ((event as CustomEvent<Flyout | null>).detail !== self) close();
    }
    window.addEventListener(EVENT, onOther);
    return () => window.removeEventListener(EVENT, onOther);
  }, [self, close]);
}
