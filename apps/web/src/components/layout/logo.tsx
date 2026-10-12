import { cn } from "@/lib/utils";

/**
 * Angel's mark: the letter A, drawn as two strokes and a crossbar, with a halo above its peak.
 * It uses `currentColor`, so it follows the text colour in light and dark mode. Decorative: the
 * name is always next to it, visible or for screen readers only.
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
      <ellipse cx="16" cy="5" rx="6" ry="2" transform="rotate(-10 16 5)" strokeWidth="1.5" />
      <path d="M6.5 28.5 16 10.5l9.5 18" strokeWidth="2.4" />
      <path d="M10.8 22.6Q16 19.8 21.2 22.6" strokeWidth="2.4" />
    </svg>
  );
}

/** The mark and the name. `showName={false}` is the mark alone (the header), the name kept for screen readers. */
export function AngelLogo({
  className,
  markClassName,
  showName = true,
}: {
  className?: string;
  markClassName?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <AngelMark className={markClassName} />
      <span className={showName ? undefined : "sr-only"}>Angel</span>
    </span>
  );
}
