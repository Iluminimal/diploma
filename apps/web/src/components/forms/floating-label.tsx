import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Class names for an input that has a `FloatingLabel` beside it: room for the label above the text. */
export const floatingInputClass =
  "border-field bg-card focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-14 w-full rounded-xl border px-4 pt-5 pb-1 text-[1.0625rem] transition-[border-color,box-shadow,padding] duration-200 outline-none focus-visible:ring-3 aria-invalid:ring-3";

/**
 * The label of a field as on apple.com or google.com: it sits inside the empty field like a
 * placeholder and floats up to the top edge once the field has focus or text. Put it in the same
 * `group relative` box as an `<input placeholder=" ">` (the blank placeholder is what tells CSS the field is empty).
 */
export function FloatingLabel({ htmlFor, className, children }: { htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "text-muted-foreground pointer-events-none absolute top-1/2 left-4 origin-left -translate-y-1/2 text-[1.0625rem] transition-all duration-200 ease-out",
        "group-focus-within:top-3.5 group-focus-within:translate-y-0 group-focus-within:text-xs",
        "group-has-[input:not(:placeholder-shown)]:top-3.5 group-has-[input:not(:placeholder-shown)]:translate-y-0 group-has-[input:not(:placeholder-shown)]:text-xs",
        className,
      )}
    >
      {children}
    </label>
  );
}
