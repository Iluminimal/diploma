"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useFormat } from "@/i18n/use-format";
import { useVocab } from "@/i18n/use-vocab";
import { cn } from "@/lib/utils";
import { isLightSwatch, swatchFor } from "./colors";
import { toggleValue, type CatalogFilters, type MultiKey } from "./filters";
import { type CatalogFilterOptions, type CategoryNode } from "./product";

export type FilterGroup = "gender" | "color" | "price" | "season" | "usage" | "stock";

type Props<T extends CatalogFilters> = {
  options: CatalogFilterOptions;
  value: T;
  onChange: (next: T) => void;
  /**
   * Ангиллын мод нь хайлтыг нарийсгаж болох газарт л хэрэгтэй; search оронд нь "Detected" ашиглана.
   */
  showCategories?: boolean;
  /** Аль бүлгүүдийг харуулах (default: бүгд). */
  groups?: ReadonlyArray<FilterGroup>;
  idPrefix?: string;
};

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-border border-b py-5 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between type-body font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="flex-1 cursor-pointer type-caption font-normal">
        {label}
      </Label>
    </div>
  );
}

const TREE_KEY: Record<number, MultiKey> = { 1: "master_category", 2: "sub_category", 3: "article_type" };

function hasSelectedDescendant(node: CategoryNode, value: CatalogFilters): boolean {
  return node.children.some((child) => {
    const key = TREE_KEY[child.level];
    return (key && value[key].includes(child.name)) || hasSelectedDescendant(child, value);
  });
}

type TreeProps<T extends CatalogFilters> = {
  value: T;
  onChange: (next: T) => void;
  idPrefix: string;
};

/**
 * Дэд ангилалтай ангилал. Сумны товч тусдаа button (`<summary>` доторх checkbox нь интерактив
 * хяналтуудыг үүрлүүлэх байсан); доторх зүйл сонгогдсон үед салбар өөрөө нээгдэж, хэрэглэгч гараар
 * нээж хаах хүртэл хэвээр байна.
 */
function CategoryBranch<T extends CatalogFilters>({
  node,
  value,
  onChange,
  idPrefix,
}: TreeProps<T> & { node: CategoryNode }) {
  const t = useTranslations("catalog");
  const vocab = useVocab();
  const key = TREE_KEY[node.level]!;
  const selected = value[key].includes(node.name);
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (selected || hasSelectedDescendant(node, value));
  const panel = `${idPrefix}-${node.path}-children`;
  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setManual(!open)}
          aria-expanded={open}
          aria-controls={panel}
          aria-label={t(open ? "hideSubcategories" : "showSubcategories", { name: vocab.category(node.name) })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 grid size-7 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-3"
        >
          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
        </button>
        <div className="flex-1">
          <CheckRow
            id={`${idPrefix}-${node.path}`}
            label={vocab.category(node.name)}
            checked={selected}
            onCheckedChange={() => onChange(toggleValue(value, key, node.name))}
          />
        </div>
      </div>
      {open && (
        <div id={panel} className="border-border ml-3 border-l pl-3">
          <CategoryTree nodes={node.children} value={value} onChange={onChange} idPrefix={idPrefix} />
        </div>
      )}
    </li>
  );
}

function CategoryTree<T extends CatalogFilters>({ nodes, ...props }: TreeProps<T> & { nodes: CategoryNode[] }) {
  const vocab = useVocab();
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const key = TREE_KEY[node.level];
        if (!key) return null;
        if (node.children.length > 0) return <CategoryBranch key={node.path} node={node} {...props} />;
        return (
          <li key={node.path} className="pl-8">
            <CheckRow
              id={`${props.idPrefix}-${node.path}`}
              label={vocab.category(node.name)}
              checked={props.value[key].includes(node.name)}
              onCheckedChange={() => props.onChange(toggleValue(props.value, key, node.name))}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Үнийн slider-ын алхам: мянган төгрөг. */
const PRICE_STEP = 1000;

function PriceFilter<T extends CatalogFilters>({
  range,
  value,
  onChange,
}: {
  range: CatalogFilterOptions["price_range"];
  value: T;
  onChange: (next: T) => void;
}) {
  const t = useTranslations("catalog");
  const format = useFormat();
  // Slider бүхэл төгрөгөөр, мянгаар шатлан ажиллана; API, URL бага нэгж (төгрөг x 100) ашиглана.
  const lo = Math.floor(range.min_cents / 100 / PRICE_STEP) * PRICE_STEP;
  const hi = Math.ceil(range.max_cents / 100 / PRICE_STEP) * PRICE_STEP;
  const committed: [number, number] = [
    value.min_price !== undefined ? Math.round(value.min_price / 100) : lo,
    value.max_price !== undefined ? Math.round(value.max_price / 100) : hi,
  ];
  const [dragging, setDragging] = useState<[number, number] | null>(null);
  const shown = dragging ?? committed;

  function commit([min, max]: number[]) {
    setDragging(null);
    onChange({
      ...value,
      min_price: min! > lo ? min! * 100 : undefined,
      max_price: max! < hi ? max! * 100 : undefined,
    });
  }

  return (
    <div className="px-1">
      <Slider
        min={lo}
        max={hi}
        step={PRICE_STEP}
        value={shown}
        onValueChange={(v) => setDragging([v[0]!, v[1]!])}
        onValueCommit={commit}
        aria-label={t("priceRange")}
        className="py-3"
      />
      <div className="text-muted-foreground mt-1 flex justify-between type-fine tabular-nums">
        <span>{format.price(shown[0] * 100)}</span>
        <span>{format.price(shown[1] * 100)}{shown[1] >= hi ? "+" : ""}</span>
      </div>
    </div>
  );
}

export function FilterFields<T extends CatalogFilters>({
  options,
  value,
  onChange,
  showCategories = true,
  groups = ["gender", "color", "price", "season", "usage", "stock"],
  idPrefix = "f",
}: Props<T>) {
  const t = useTranslations("catalog");
  const vocab = useVocab();
  const show = (g: (typeof groups)[number]) => groups.includes(g);
  return (
    <div>
      {show("stock") && (
        <div className="border-border border-b pb-3">
          <CheckRow
            id={`${idPrefix}-in-stock`}
            label={t("inStockOnly")}
            checked={value.in_stock}
            onCheckedChange={() => onChange({ ...value, in_stock: !value.in_stock })}
          />
        </div>
      )}
      {show("gender") && (
        <Group title={t("gender")}>
          {options.genders.map((g) => (
            <CheckRow
              key={g}
              id={`${idPrefix}-gender-${g}`}
              label={vocab.gender(g)}
              checked={value.gender.includes(g)}
              onCheckedChange={() => onChange(toggleValue(value, "gender", g))}
            />
          ))}
        </Group>
      )}
      {showCategories && (
        <Group title={t("category")}>
          <div className="max-h-80 overflow-y-auto pr-1">
            <CategoryTree nodes={options.categories} value={value} onChange={onChange} idPrefix={`${idPrefix}-cat`} />
          </div>
        </Group>
      )}
      {show("color") && (
        <Group title={t("colour")}>
          <ul className="flex flex-wrap gap-2" aria-label={t("colour")}>
            {options.colors
              .filter((c) => c !== "NA")
              .map((color) => {
                const on = value.color.includes(color);
                return (
                  <li key={color}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={vocab.colour(color)}
                      title={vocab.colour(color)}
                      onClick={() => onChange(toggleValue(value, "color", color))}
                      className={cn(
                        "border-border focus-visible:ring-ring/50 relative grid size-7 place-items-center rounded-full border outline-none focus-visible:ring-3",
                        on && "ring-foreground ring-2 ring-offset-2 ring-offset-background",
                      )}
                      style={{ background: swatchFor(color) }}
                    >
                      {on && (
                        <Check className={cn("size-3.5", isLightSwatch(color) ? "text-black" : "text-white")} />
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </Group>
      )}
      {show("price") && (
        <Group title={t("price")}>
          <PriceFilter
            // URL гаднаас мужийг өөрчилбөл (жишээ нь "clear all") дахин mount хийнэ.
            key={`${value.min_price ?? ""}-${value.max_price ?? ""}`}
            range={options.price_range}
            value={value}
            onChange={onChange}
          />
        </Group>
      )}
      {show("season") && (
        <Group title={t("season")} defaultOpen={false}>
          {options.seasons.map((s) => (
            <CheckRow
              key={s}
              id={`${idPrefix}-season-${s}`}
              label={vocab.season(s)}
              checked={value.season.includes(s)}
              onCheckedChange={() => onChange(toggleValue(value, "season", s))}
            />
          ))}
        </Group>
      )}
      {show("usage") && (
        <Group title={t("occasion")} defaultOpen={false}>
          {options.usages
            .filter((u) => u !== "NA")
            .map((u) => (
              <CheckRow
                key={u}
                id={`${idPrefix}-usage-${u}`}
                label={vocab.usage(u)}
                checked={value.usage.includes(u)}
                onCheckedChange={() => onChange(toggleValue(value, "usage", u))}
              />
            ))}
        </Group>
      )}
    </div>
  );
}
