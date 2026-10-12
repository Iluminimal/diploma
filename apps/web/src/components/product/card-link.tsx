"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

/**
 * The link around a product card. On click it names the card's photo "product-hero" for the page
 * transition, so the photo grows into the product page's gallery instead of cross-fading. The name
 * is set only on the card that was clicked (two elements with one name cancel the whole
 * transition), and the old page's own hero, if it has one, gives its name up.
 */
export function CardLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  function name(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const opensInPlace = !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0;
    if (!opensInPlace) return;
    const photo = event.currentTarget.querySelector<HTMLElement>("[data-card-photo]");
    if (!photo) return;
    for (const other of document.querySelectorAll<HTMLElement>("[data-fly-source]")) other.style.viewTransitionName = "none";
    photo.style.viewTransitionName = "product-hero";
  }
  return <Link {...props} onClick={name} />;
}
