import type { ReactNode } from "react";

/** Admin дэлгэцийн гарчиг (хуудасны цорын ганц `h1`), гол үйлдлийн товчид зай үлдээнэ. */
export function AdminPageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: string;
  /** Гарчгийн дээрх холбоос, жишээ нь "All orders". */
  back?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-3 md:mb-8">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="type-title break-words">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
