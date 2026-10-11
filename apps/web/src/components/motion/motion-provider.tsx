"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () => import("./features").then((module) => module.default);

/**
 * The animation engine, for the few places that need real orchestration (a cart line that slides
 * shut when removed). Scroll reveals, the hero and the header are CSS and never load it: wrap
 * only what animates, and the engine is fetched only when that part of the page is shown.
 * `reducedMotion="user"` makes transform animations honour the visitor's operating-system setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
