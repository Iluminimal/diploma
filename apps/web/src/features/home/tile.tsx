import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "hero" | "half" | "full";

const HEIGHT: Record<Size, string> = {
  hero: "min-h-[36rem] md:min-h-[43rem]",
  half: "min-h-[32rem] md:min-h-[36rem]",
  full: "min-h-[30rem] md:min-h-[36rem]",
};

/**
 * One of apple.com's home tiles: edge to edge, a centred headline and line of text, one or two pill
 * buttons, and a picture sitting under them. Light tiles are the grey `#f5f5f7`, dark ones black.
 * The sizes are those measured on apple.com: 56px headlines on the first tile, 40px on the others,
 * 692px and 580px high.
 */
export function Tile({
  tone = "light",
  size,
  label,
  heading,
  as: Heading = "h2",
  subtitle,
  actions,
  animate = true,
  className,
  children,
}: {
  tone?: "light" | "dark";
  size: Size;
  /** Names the region for assistive technology. */
  label: string;
  heading: ReactNode;
  as?: "h1" | "h2";
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Words settle in as the tile scrolls into view. Off for the first tile, whose headline is never animated. */
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <section
      aria-label={label}
      className={cn(
        "relative flex flex-col items-center overflow-hidden text-center",
        // A black tile is a dark-mode island: the blue of its links is the lighter one, which reads on black.
        dark ? "dark bg-black text-white" : "bg-secondary text-foreground",
        HEIGHT[size],
        className,
      )}
    >
      <div className={cn("px-4 pt-12 md:pt-14", animate && "tile-copy")}>
        <Heading
          className={cn(
            "text-balance font-semibold",
            size === "hero"
              ? "text-[2.5rem] leading-[1.1] tracking-[-0.009em] md:text-[3.5rem] md:leading-[1.07143] md:tracking-[-0.005em]"
              : "text-[2rem] leading-[1.125] tracking-[0.004em] md:text-[2.5rem] md:leading-[1.1] md:tracking-normal",
          )}
        >
          {heading}
        </Heading>
        {subtitle && (
          <p className={cn("mx-auto mt-2 max-w-xl text-balance", size === "hero" ? "text-[1.3125rem] leading-[1.2] md:text-[1.75rem]" : "text-[1.3125rem] leading-[1.2]", dark && "text-white/80")}>
            {subtitle}
          </p>
        )}
        {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
