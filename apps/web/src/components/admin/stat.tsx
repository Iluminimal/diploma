import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Том тоотой үзүүлэлтийн самбар (KPI): гарчиг, утга, харьцуулалт (`footer`). `<dl>` дотор `<dt>`/`<dd>` болж, "Key figures" бүлгийг хэмжилтийн жагсаалт болгоно.
 */
export function Stat({
  label,
  value,
  footer,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("admin-surface flex flex-col gap-3 p-5", className)}>
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="space-y-1.5">
        <span className="type-title block tabular-nums">{value}</span>
        {footer}
      </dd>
    </div>
  );
}
