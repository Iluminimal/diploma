"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  as?: "div" | "li" | "section" | "p";
  /** Seconds to wait before starting; stagger siblings with small multiples. */
  delay?: number;
  /** Distance travelled upwards, in px. */
  y?: number;
  /** `view`: when scrolled into view (below the fold). `mount`: as soon as it appears. */
  when?: "view" | "mount";
  className?: string;
};

/**
 * Fade and rise into place, once. The animation itself is CSS (`[data-reveal]` in globals.css);
 * this only flips `data-in` at the right moment, so it costs no animation library on the way in.
 * Never wrap the largest element of the first screen in it: it starts invisible, which would
 * hold back the page's largest contentful paint. Without scripting, or with reduced motion, the
 * content is simply shown.
 */
export function Reveal({ children, as = "div", delay = 0, y = 18, when = "view", className }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const show = () => element.setAttribute("data-in", "");
    if (when === "mount" || typeof IntersectionObserver === "undefined") {
      // A frame later, so the hidden state is painted first and the change is a transition.
      const frame = requestAnimationFrame(show);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [when]);

  const Component = as as ElementType;
  return (
    <Component
      ref={ref}
      data-reveal=""
      className={className}
      style={{ "--reveal-delay": `${delay}s`, "--reveal-y": `${y}px` } as CSSProperties}
    >
      {children}
    </Component>
  );
}
