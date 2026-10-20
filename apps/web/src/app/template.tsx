import { ViewTransition, type ReactNode } from "react";

/**
 * Template навигаци бүрт дахин үүсдэг тул хуудас бүр өөрийн орох, гарах animation-тай: хуучин
 * агуулга бүдгэрч, шинэ агуулга дээш гарна. React browser-ийн View Transitions API-г удирддаг
 * (Chromium, Safari, Firefox); бусад дээр хуудас зүгээр л солигдоно. Reduced motion-ыг
 * globals.css-д зохицуулсан.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
