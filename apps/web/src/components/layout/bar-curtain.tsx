"use client";

import { announceFlyout } from "./bar-flyout";

/**
 * apple.com's curtain: while a flyout is open under the bar (the CSS shows it when `<html>` has
 * `data-bar-panel`) the rest of the page is veiled and blurred, and pressing it closes the flyout.
 * Not inside the header: its backdrop blur would make it the containing block of anything `fixed`.
 */
export function BarCurtain() {
  return <div aria-hidden className="bar-curtain" onClick={() => announceFlyout(null)} />;
}
