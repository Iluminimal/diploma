"use client";

import { useRef, type PointerEvent } from "react";

const THRESHOLD = 110; // px
const FLICK = 0.6; // px per ms

/**
 * Drag a panel away to close it: a drawer to the right, a bottom sheet down. Touch only (a mouse
 * has the close button), and only when the finger moves along `axis` more than across it, so the
 * list inside still scrolls. The panel follows the finger; let go past a distance or with a flick
 * and `onDismiss` runs, otherwise it springs back.
 */
export function useSwipeDismiss(axis: "x" | "y", onDismiss: () => void) {
  const drag = useRef<{ x: number; y: number; at: number; active: boolean; last: number } | null>(null);

  function follow(element: HTMLElement, distance: number, animated: boolean) {
    element.style.transition = animated ? "translate 350ms var(--ease-out-expo)" : "none";
    element.style.translate = distance === 0 ? "" : axis === "x" ? `${distance}px 0` : `0 ${distance}px`;
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType !== "touch") return;
      drag.current = { x: event.clientX, y: event.clientY, at: performance.now(), active: false, last: 0 };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = drag.current;
      if (!start) return;
      const along = axis === "x" ? event.clientX - start.x : event.clientY - start.y;
      const across = axis === "x" ? event.clientY - start.y : event.clientX - start.x;
      if (!start.active) {
        if (Math.abs(across) > Math.abs(along) && Math.abs(across) > 8) {
          drag.current = null; // scrolling the other way
          return;
        }
        if (along < 8) return;
        start.active = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      start.last = Math.max(0, along);
      follow(event.currentTarget, start.last, false);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const start = drag.current;
      drag.current = null;
      if (!start?.active) return;
      const speed = start.last / Math.max(1, performance.now() - start.at);
      if (start.last > THRESHOLD || speed > FLICK) onDismiss();
      else follow(event.currentTarget, 0, true);
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (drag.current?.active) follow(event.currentTarget, 0, true);
      drag.current = null;
    },
  };
}
