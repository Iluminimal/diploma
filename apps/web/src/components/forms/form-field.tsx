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

/** Хяналтын элемент ба түүний hint, validation мессеж screen reader-д холбогдсон label-тай. */
export function Field({ id, label, error, hint, className, children }: Props) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {/* Алдаа гарахад хяналтын элемент нэг удаа сэгсэрнэ (class нэмэгддэг тул нэг удаа тоглоно). */}
      <div className={error ? "animate-shake" : undefined}>{children}</div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground type-fine">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-destructive animate-in fade-in slide-in-from-top-1 type-fine duration-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** `Field` доторх хяналтын элементийн `aria-*` props. */
export function fieldAria(id: string, error?: string, hint?: string) {
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}
