import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

/** A labelled control with its hint and validation message wired up for screen readers. */
export function Field({ id, label, error, hint, className, children }: Props) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {/* The control shakes once when an error appears (the class is added, so it plays once). */}
      <div className={error ? "animate-shake" : undefined}>{children}</div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-destructive animate-in fade-in slide-in-from-top-1 text-xs duration-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Styling for a native `<select>` that matches `Input`. */
export const selectClass =
  "border-input bg-background focus-visible:ring-ring/50 focus-visible:border-ring h-11 w-full rounded-xl border px-3 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30";

/** `aria-*` props for the control inside a `Field`. */
export function fieldAria(id: string, error?: string, hint?: string) {
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}
