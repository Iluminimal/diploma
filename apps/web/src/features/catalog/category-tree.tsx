import { useTranslations } from "next-intl";
import Link from "next/link";
import { useFormat } from "@/i18n/use-format";
import { useVocab } from "@/i18n/use-vocab";
import { cn } from "@/lib/utils";
import { categoryHref, drilldown, type CategoryTrail } from "./nav";

const ROW =
  "focus-visible:ring-ring/50 flex items-center justify-between gap-3 rounded-lg py-1.5 pr-2 type-caption outline-none transition-colors duration-200 focus-visible:ring-3";

/**
 * Sidebar дахь Amazon маягийн drill-down: дээш буцах зам, дараа нь тоотой дараагийн түвшин. Энгийн
 * холбоос тул script шаардахгүй, алхам бүр crawl хийгдэх хуудас.
 */
export function CategoryTree({ trail }: { trail: CategoryTrail }) {
  const t = useTranslations("catalog");
  const format = useFormat();
  const vocab = useVocab();
  const { department, nodes } = trail;
  const { ancestors, options, current } = drilldown(department, nodes);
  const rootCurrent = nodes.length === 0;
  const depthPad = (depth: number) => ({ paddingLeft: `${depth * 0.875}rem` });
  return (
    <nav aria-label={t("categories")} className="border-border mb-2 border-b pb-4">
      <h2 className="mb-2 type-body font-semibold">{t("category")}</h2>
      <ul className="space-y-0.5">
        <li>
          <Link
            href={categoryHref(department.slug)}
            aria-current={rootCurrent ? "page" : undefined}
            className={cn(ROW, rootCurrent ? "font-semibold" : "text-muted-foreground hover:text-foreground")}
          >
            {t("allIn", { department: vocab.department(department.name) })}
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
                {vocab.category(node.name)}
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
                {vocab.category(node.name)}
                <span className="text-muted-foreground type-fine tabular-nums">
                  {format.number(node.product_count)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
