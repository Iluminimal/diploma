import { cn } from "@/lib/utils";

/**
 * Angel's mark: the letter A, drawn as two strokes and a crossbar, with a halo above its peak.
 * It uses `currentColor`, so it follows the text colour in light and dark mode. Decorative: the
 * name is always written next to it.
 */
export function AngelMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-7", className)}
    >
      <ellipse cx="16" cy="5.5" rx="6.5" ry="2.4" strokeWidth="2" />
      <path d="M6.5 28 16 11l9.5 17" strokeWidth="3" />
      <path d="M11 21.5h10" strokeWidth="3" />
    </svg>
  );
}

/** The mark and the name, for the header and footer. */
export function AngelLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <AngelMark className={markClassName} />
      Angel
    </span>
  );
}
