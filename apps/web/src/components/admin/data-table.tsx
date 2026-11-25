"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Баганаар эрэмбэлэх API `sort` утгууд (өгсөх, буурах). Аль нэг нь л байж болно. */
  sort?: { asc?: string; desc?: string };
};

type Key = string | number;

/** Сонгосон мөрүүдийн төлөв (bulk үйлдэлд). */
export function useSelection<K extends Key = Key>() {
  const [selected, setSelected] = useState<ReadonlySet<K>>(new Set());
  const toggle = useCallback((key: K) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const setAll = useCallback((keys: readonly K[], on: boolean) => setSelected(on ? new Set(keys) : new Set()), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, toggle, setAll, clear };
}

type Selection<T, K extends Key> = {
  selected: ReadonlySet<K>;
  onToggle: (key: K) => void;
  onToggleAll: (on: boolean) => void;
  /** Мөрийн checkbox-ын нэр, жишээ нь "Сонгох: Кроссовок". */
  label: (row: T) => string;
  selectAllLabel: string;
};

/** Эрэмбийн дараагийн утга: одоогийнхоо эсрэг (өгсөх <-> буурах), үгүй бол эхний боломжит. */
export function nextSort(current: string | undefined, sort: NonNullable<Column<unknown>["sort"]>): string | undefined {
  if (current !== undefined && current === sort.asc && sort.desc) return sort.desc;
  if (current !== undefined && current === sort.desc && sort.asc) return sort.asc;
  return sort.asc ?? sort.desc;
}

/**
 * Admin-ы хүснэгт: sticky толгой, баганаар эрэмбэлэх (URL-ийн `sort`), мөр сонгох. Утсан дээр
 * (`renderCard` өгсөн бол) хүснэгтийн оронд карт жагсаалт: НЭГИЙГ нь л render хийнэ, ингэснээр
 * давхар текст, давхар landmark үүсэхгүй.
 */
export function DataTable<T, K extends Key = Key>({
  caption,
  columns,
  rows,
  rowKey,
  sort,
  sortHref,
  selection,
  renderCard,
  busy,
}: {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => K;
  sort?: string;
  sortHref?: (sort: string) => string;
  selection?: Selection<T, K>;
  renderCard?: (row: T) => ReactNode;
  busy?: boolean;
}) {
  const narrow = useMediaQuery("(max-width: 767px)");

  if (narrow && renderCard) {
    return (
      <ul aria-label={caption} aria-busy={busy} className="space-y-2.5">
        {rows.map((row) => (
          <li key={rowKey(row)} className="admin-surface p-4">
            {renderCard(row)}
          </li>
        ))}
      </ul>
    );
  }

  const keys = rows.map(rowKey);
  const allSelected = selection !== undefined && keys.length > 0 && keys.every((key) => selection.selected.has(key));
  const someSelected = selection !== undefined && !allSelected && keys.some((key) => selection.selected.has(key));

  return (
    <div className="admin-surface overflow-clip" aria-busy={busy}>
      <table className="w-full caption-bottom text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground text-xs">
            {selection && (
              <th scope="col" className="bg-[var(--admin-surface)] w-11 py-3 pl-5">
                <Checkbox
                  aria-label={selection.selectAllLabel}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => selection.onToggleAll(checked === true)}
                />
              </th>
            )}
            {columns.map((column) => {
              const active = sort !== undefined && (sort === column.sort?.asc || sort === column.sort?.desc);
              const ariaSort = active ? (sort === column.sort?.asc ? "ascending" : "descending") : column.sort ? "none" : undefined;
              const target = column.sort && sortHref ? nextSort(sort, column.sort) : undefined;
              const Icon = !active ? ChevronsUpDown : sort === column.sort?.asc ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn("bg-[var(--admin-surface)] px-4 py-3 font-medium first:pl-5 last:pr-5", column.align === "right" ? "text-right" : "text-left", column.className)}
                >
                  {target !== undefined && sortHref ? (
                    <Link href={sortHref(target)} className={cn("hover:text-foreground focus-visible:ring-ring/50 -mx-1 inline-flex items-center gap-1 rounded-md px-1 outline-none focus-visible:ring-3", active && "text-foreground")}>
                      {column.header}
                      <Icon aria-hidden className="size-3" />
                    </Link>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const checked = selection?.selected.has(key) ?? false;
            return (
              <tr key={key} data-selected={checked || undefined} className="border-border/70 hover:bg-muted/50 data-[selected]:bg-brand/5 border-t transition-colors">
                {selection && (
                  <td className="w-11 py-3 pl-5">
                    <Checkbox aria-label={selection.label(row)} checked={checked} onCheckedChange={() => selection.onToggle(key)} />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.id} className={cn("px-4 py-3 align-middle first:pl-5 last:pr-5", column.align === "right" && "text-right", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
