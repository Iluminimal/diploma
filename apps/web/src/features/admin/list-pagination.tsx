import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type Props = {
  label: string;
  page: number;
  pages: number;
  total: number;
  /** URL of another page of the same list. */
  hrefFor: (page: number) => string;
};

export function ListPagination({ label, page, pages, total, hrefFor }: Props) {
  if (pages <= 1) return <p className="text-muted-foreground text-sm">{total} in total</p>;
  return (
    <nav aria-label={label} className="flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="inline-flex items-center gap-1 font-medium">
          <ChevronLeft aria-hidden className="size-4" /> Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground">
        Page {page} of {pages} · {total} in total
      </span>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} className="inline-flex items-center gap-1 font-medium">
          Next <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
