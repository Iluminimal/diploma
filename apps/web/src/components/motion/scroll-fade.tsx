import type { ReactNode } from "react";

/**
 * Content that recedes as it scrolls away: a little smaller, lower and fainter, like the hero of
 * an Apple product page. Pure CSS (`.scroll-fade` in globals.css) driven by the scroll position,
 * so it needs no script; browsers without scroll-driven animations just show it as it is. It
 * starts at its natural size and opacity, so it is never held back from the first paint.
 */
export function ScrollFade({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`scroll-fade ${className ?? ""}`.trim()}>{children}</div>;
}
