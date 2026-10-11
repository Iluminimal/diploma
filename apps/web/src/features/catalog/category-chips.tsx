import Link from "next/link";
import { cn } from "@/lib/utils";

export type Chip = { label: string; href: string; count?: number };

/** A swipeable row of links: departments on /products, the next level down on /c/... pages. */
export function CategoryChips({ label, items, className }: { label: string; items: Chip[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className={cn("-mx-4 mb-6 md:mx-0", className)}>
      <ul className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
        {items.map((chip) => (
          <li key={chip.href} className="shrink-0">
            <Link
              href={chip.href}
              className="group/chip bg-secondary text-secondary-foreground hover:bg-foreground hover:text-background focus-visible:ring-ring/60 inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm outline-none transition-colors duration-200 focus-visible:ring-3"
            >
              {chip.label}
              {chip.count !== undefined && (
                <span className="text-muted-foreground group-hover/chip:text-background/75 text-xs tabular-nums">{chip.count.toLocaleString("en-US")}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
