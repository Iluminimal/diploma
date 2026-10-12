import { ChevronDown } from "lucide-react";
import "./disclosure.css";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A titled section that opens and closes (the product page's "Details" and "Delivery"). It is a
 * plain `<details>`, so it works without script, is keyboard-operable and announces its state;
 * `globals.css` makes the panel slide.
 */
export function Disclosure({
  title,
  defaultOpen = false,
  className,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={cn("disclosure border-border border-t", className)}>
      <summary className="focus-visible:ring-ring/60 flex cursor-pointer items-center justify-between gap-4 rounded-md py-5 text-[1.0625rem] font-semibold outline-none select-none focus-visible:ring-3">
        {title}
        <ChevronDown
          aria-hidden
          className="disclosure-chevron text-muted-foreground size-4 transition-[rotate] duration-300 ease-out-expo"
        />
      </summary>
      <div className="type-caption pb-6 text-[0.9375rem]">{children}</div>
    </details>
  );
}
