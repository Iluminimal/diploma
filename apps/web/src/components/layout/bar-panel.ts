import { useEffect } from "react";

let open = 0;

/**
 * Says to the page that a menu, search or Bag page is open, by an attribute on <html> (`data-bar-panel`)
 * for as long as `isOpen` is true. As on apple.com's phone bar, CSS then fades out everything in the
 * bar except the button that closes it (see `.phone-bar-item` in globals.css). A count, not a flag:
 * one page opening as another closes must not clear it.
 */
export function useBarPanel(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    open += 1;
    document.documentElement.dataset.barPanel = "";
    return () => {
      open -= 1;
      if (open === 0) delete document.documentElement.dataset.barPanel;
    };
  }, [isOpen]);
}
