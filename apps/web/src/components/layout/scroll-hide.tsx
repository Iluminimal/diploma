"use client";

import { useEffect } from "react";

const THRESHOLD = 8; // px of travel before the direction counts
const AFTER = 80; // never hide within the first screenful

/**
 * On phones the header slides away as you scroll down and returns as soon as you scroll up, like
 * the address bar of a browser. It only sets `data-header` on <html>; `globals.css` moves the
 * header (and anything sticky beneath it) and does nothing for reduced motion or on wider screens.
 */
export function ScrollHide() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    const onScroll = () => {
      const now = window.scrollY;
      if (now <= AFTER) root.dataset.header = "shown";
      else if (now - last > THRESHOLD) root.dataset.header = "hidden";
      else if (last - now > THRESHOLD) root.dataset.header = "shown";
      else return;
      last = now;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      delete root.dataset.header;
    };
  }, []);
  return null;
}
