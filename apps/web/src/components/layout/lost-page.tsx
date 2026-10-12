import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LINKS, categoryHref } from "@/features/catalog/nav";

/**
 * The shared look of the pages for when something is missing or broken: a large soft mark that
 * floats, a headline, a search box and the way back into the shop. Server-renderable (no script).
 */
export function LostPage({
  mark,
  title,
  children,
  actions,
}: {
  /** The big figure: "404", or a symbol for errors. */
  mark: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="container-page flex flex-col items-center gap-6 py-24 text-center md:py-32">
      <p
        aria-hidden
        className="animate-float from-foreground to-foreground/20 bg-linear-to-b bg-clip-text text-[7rem] leading-none font-semibold tracking-tighter text-transparent select-none md:text-[10rem]"
      >
        {mark}
      </p>
      <div className="animate-in fade-in slide-in-from-bottom-3 space-y-2 duration-700">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-muted-foreground mx-auto max-w-md text-sm text-balance">{children}</p>
      </div>
      <form
        action="/products"
        role="search"
        className="animate-in fade-in slide-in-from-bottom-3 relative w-full max-w-sm delay-100 duration-700 fill-mode-backwards"
      >
        <label htmlFor="lost-search" className="sr-only">
          Search the shop
        </label>
        <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        <input
          id="lost-search"
          name="q"
          type="search"
          placeholder="Search the shop"
          className="bg-secondary focus-visible:ring-ring/50 h-11 w-full rounded-full pr-4 pl-10 text-sm outline-none focus-visible:ring-3"
        />
      </form>
      <nav
        aria-label="Popular places"
        className="animate-in fade-in slide-in-from-bottom-3 flex flex-wrap justify-center gap-2 delay-200 duration-700 fill-mode-backwards"
      >
        {DEPARTMENT_LINKS.map((department) => (
          <Button key={department.slug} asChild variant="outline" className="h-10 rounded-full px-5">
            <Link href={categoryHref(department.slug)}>{department.label}</Link>
          </Button>
        ))}
        <Button asChild variant="outline" className="h-10 rounded-full px-5">
          <Link href="/products?sort=newest">New arrivals</Link>
        </Button>
        <Button asChild variant="outline" className="h-10 rounded-full px-5">
          <Link href="/search">Search by photo</Link>
        </Button>
      </nav>
      {actions}
    </div>
  );
}
