import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Admin-ы самбар (macOS grouped хэв): цагаан (харанхуй горимд `#1d1d1f`) гадаргуу, нимгэн хүрээ,
 * зөөлөн сүүдэр. Гарчиг нь `<h2>` бөгөөд `aria-labelledby`-аар хэсгийг нэрлэнэ.
 */
export function Panel({
  id,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  id: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section aria-labelledby={title ? id : undefined} className={cn("admin-surface", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0 space-y-0.5">
            {title && (
              <h2 id={id} className="type-caption text-foreground font-semibold">
                {title}
              </h2>
            )}
            {description && <p className="type-fine text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", title || action ? "pt-4" : "", bodyClassName)}>{children}</div>
    </section>
  );
}
