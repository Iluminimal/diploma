import Link from "next/link";
import { Suspense } from "react";
import { Reveal } from "@/components/motion/reveal";
import { getCatalogNav } from "@/features/catalog/api";
import { categoryHref, popularTypes, type NavNode } from "@/features/catalog/nav";
import { ProductRail, RailSkeleton } from "@/features/catalog/product-rail";
import { newest } from "./home-data";
import { SectionHeading } from "./section-heading";

type Entry = { department: string; departmentName: string; node: NavNode };

/** The biggest article types in Women and Men, biggest first, one entry per name. */
async function topCategories(limit: number): Promise<Entry[]> {
  try {
    const nav = await getCatalogNav();
    const entries = nav.departments
      .filter((d) => d.slug === "women" || d.slug === "men")
      .flatMap((d) => popularTypes(d, 12).map((node) => ({ department: d.slug, departmentName: d.name, node })))
      .sort((a, b) => b.node.product_count - a.node.product_count);
    const seen = new Set<string>();
    return entries.filter((e) => !seen.has(e.node.name) && seen.add(e.node.name)).slice(0, limit);
  } catch {
    return [];
  }
}

/** "Shop by category": quick links to the biggest article types. */
export async function CategoryPills() {
  const entries = await topCategories(12);
  if (entries.length === 0) return null;
  return (
    <section aria-label="Shop by category" className="container-page pb-12 md:pb-16">
      <Reveal>
        <SectionHeading title="Shop by category" />
      </Reveal>
      <ul className="hide-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {entries.map(({ department, departmentName, node }) => (
          <li key={`${department}-${node.path}`} className="shrink-0">
            <Link
              href={categoryHref(department, node.path)}
              className="group/pill bg-secondary hover:bg-foreground hover:text-background focus-visible:ring-ring/60 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-3"
            >
              {node.name}
              <span className="text-muted-foreground group-hover/pill:text-background/75 text-xs font-normal">{departmentName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Rail({ label, patch, href }: { label: string; patch: Parameters<typeof newest>[0]; href: string }) {
  const products = await newest(patch, 12);
  if (products.length === 0) return null;
  return (
    <section aria-label={label} className="container-page defer-render pb-14 md:pb-20">
      <Reveal>
        <SectionHeading title={label} href={href} />
      </Reveal>
      <ProductRail products={products} label={label} />
    </section>
  );
}

const rail = (key: string, props: Parameters<typeof Rail>[0]) => (
  <Suspense key={key} fallback={<div className="container-page pb-14"><RailSkeleton /></div>}>
    <Rail {...props} />
  </Suspense>
);

/** "New arrivals" and "Under $25": the two shelves every department store has. */
export function BasicShelves() {
  return (
    <>
      {rail("new", { label: "New arrivals", patch: {}, href: "/products?sort=newest" })}
      {rail("under-25", { label: "Under $25", patch: { max_price: 2500 }, href: "/products?max_price=2500&in_stock=true" })}
    </>
  );
}

/** One rail per big category: "T-shirts for Men", "Handbags for Women", and so on. */
export async function PopularShelves() {
  const entries = await topCategories(3);
  return (
    <>
      {entries.map(({ department, departmentName, node }) =>
        rail(`popular-${department}-${node.path}`, {
          label: `${node.name} for ${departmentName}`,
          patch: { department, category: node.path },
          href: categoryHref(department, node.path),
        }),
      )}
    </>
  );
}
