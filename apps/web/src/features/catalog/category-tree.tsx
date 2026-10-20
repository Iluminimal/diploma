import Link from "next/link";
import { cn } from "@/lib/utils";
import { categoryHref, drilldown, type CategoryTrail } from "./nav";

const ROW =
  "focus-visible:ring-ring/60 flex items-center justify-between gap-3 rounded-lg py-1.5 pr-2 text-[0.9375rem] outline-none transition-colors duration-200 focus-visible:ring-3";

/**
 * Sidebar дахь Amazon маягийн drill-down: дээш буцах зам, дараа нь тоотой дараагийн түвшин. Энгийн
 * холбоос тул script шаардахгүй, алхам бүр crawl хийгдэх хуудас.
 */
export function CategoryTree({ trail }: { trail: CategoryTrail }) {
  const { department, nodes } = trail;
  const { ancestors, options, current } = drilldown(department, nodes);
  const rootCurrent = nodes.length === 0;
  const depthPad = (depth: number) => ({ paddingLeft: `${depth * 0.875}rem` });
  return (
    <nav aria-label="Categories" className="border-border mb-2 border-b pb-4">
      <h2 className="mb-2 text-[1.0625rem] font-semibold">Category</h2>
      <ul className="space-y-0.5">
        <li>
          <Link
            href={categoryHref(department.slug)}
            aria-current={rootCurrent ? "page" : undefined}
            className={cn(ROW, rootCurrent ? "font-semibold" : "text-muted-foreground hover:text-foreground")}
          >
            All {department.name}
          </Link>
        </li>
        {ancestors.map((node, i) => {
          const isCurrent = node === current;
          return (
            <li key={node.path}>
              <Link
                href={categoryHref(department.slug, node.path)}
                aria-current={isCurrent ? "page" : undefined}
                style={depthPad(i + 1)}
                className={cn(ROW, isCurrent ? "font-semibold" : "text-muted-foreground hover:text-foreground")}
              >
                {node.name}
              </Link>
            </li>
          );
        })}
        {options.map((node) => {
          const isCurrent = node === current;
          return (
            <li key={node.path}>
              <Link
                href={categoryHref(department.slug, node.path)}
                aria-current={isCurrent ? "page" : undefined}
                style={depthPad(ancestors.length + 1)}
                className={cn(ROW, isCurrent ? "font-semibold" : "hover:text-foreground text-foreground/80")}
              >
                {node.name}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {node.product_count.toLocaleString("en-US")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
