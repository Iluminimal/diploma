"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () => import("./features").then((module) => module.default);

/**
 * Жинхэнэ зохицуулалт хэрэгтэй цөөн газрын animation engine (устгахад гулсаж хаагддаг сагсны мөр).
 * Scroll reveal, hero, header нь CSS бөгөөд үүнийг хэзээ ч ачаалдаггүй: зөвхөн animation хийдэг
 * хэсгийг ороо, ингэснээр хуудасны тэр хэсэг харагдах үед л engine татагдана.
 * `reducedMotion="user"` нь transform animation-ыг үйлдлийн системийн тохиргоог дагуулна.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
