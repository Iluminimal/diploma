import { ViewTransition, type ReactNode } from "react";

/**
 * A template is re-created on every navigation, so each page gets its own enter and exit: the
 * old content fades out, the new content fades up. React drives the browser's View Transitions
 * API (Chromium, Safari, Firefox); elsewhere the page just changes. Reduced motion is handled
 * in globals.css.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
