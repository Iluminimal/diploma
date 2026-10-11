"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPARTMENT_LINKS, categoryHref, popularTypes, type NavDepartment } from "@/features/catalog/nav";
import { useCatalogNav } from "@/features/catalog/use-catalog-nav";
import { cn } from "@/lib/utils";

const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 160;
const SUBCATEGORIES_SHOWN = 8;

const TOP_LINK =
  "focus-visible:ring-ring/60 flex h-full items-center rounded-md px-1.5 text-xs outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-inset";

const PANEL_LINK =
  "hover:text-brand focus-visible:ring-ring/60 -mx-2 block rounded-md px-2 py-1 text-[1.0625rem] leading-snug font-semibold tracking-tight outline-none transition-colors duration-150 focus-visible:ring-3";

/**
 * Desktop department menu. The top-level entries are ordinary links (they work before any script
 * or data arrives); a panel with the category tree opens under the header on hover or keyboard
 * focus. ArrowDown moves into the open panel, Escape closes it and returns to the link.
 */
export function MegaMenu() {
  const pathname = usePathname();
  const [wanted, setWanted] = useState(false);
  // Remember where the panel was opened: after a navigation it counts as closed, without an effect.
  const [opened, setOpened] = useState<{ slug: string; pathname: string } | null>(null);
  const openSlug = opened && opened.pathname === pathname ? opened.slug : null;
  const setOpenSlug = (next: string | null | ((current: string | null) => string | null)) =>
    setOpened((current) => {
      const slug = typeof next === "function" ? next(current?.pathname === pathname ? current.slug : null) : next;
      return slug ? { slug, pathname } : null;
    });
  const timer = useRef<number | undefined>(undefined);
  const { data } = useCatalogNav(wanted);

  // Warm the data shortly after the page settles, so the first hover is instant.
  useEffect(() => {
    const id = window.setTimeout(() => setWanted(true), 2500);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function schedule(next: string | null, delay: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpenSlug(next), delay);
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, slug: string) {
    if (event.key === "Escape" && openSlug) {
      setOpenSlug(null);
      event.currentTarget.querySelector<HTMLElement>("[data-mega-trigger]")?.focus();
    } else if (event.key === "ArrowDown" && event.target instanceof HTMLElement && "megaTrigger" in event.target.dataset) {
      if (!data?.departments.some((d) => d.slug === slug)) return;
      event.preventDefault();
      setOpenSlug(slug);
      // The panel turns visible on the next render; focus then.
      const item = event.currentTarget;
      requestAnimationFrame(() => item.querySelector<HTMLElement>("[data-mega-link]")?.focus());
    }
  }

  return (
    <nav
      aria-label="Main"
      className="hidden flex-1 self-stretch md:block"
      onPointerEnter={() => setWanted(true)}
      onFocus={() => setWanted(true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && schedule(null, CLOSE_DELAY_MS)}
    >
      <ul className="flex h-full items-center justify-center gap-7">
        {DEPARTMENT_LINKS.map((link) => {
          const department = data?.departments.find((d) => d.slug === link.slug);
          const open = openSlug === link.slug;
          const panelId = `mega-${link.slug}`;
          return (
            <li
              key={link.slug}
              className="h-full"
              onKeyDown={(event) => onKeyDown(event, link.slug)}
              onPointerEnter={(event) =>
                event.pointerType === "mouse" && schedule(link.slug, openSlug ? 0 : OPEN_DELAY_MS)
              }
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpenSlug((s) => (s === link.slug ? null : s));
              }}
            >
              <Link
                href={categoryHref(link.slug)}
                data-mega-trigger
                aria-expanded={department ? open : undefined}
                aria-controls={department ? panelId : undefined}
                className={cn(TOP_LINK, open ? "text-foreground" : "text-foreground/80 hover:text-foreground")}
              >
                {link.label}
              </Link>
              <div
                id={panelId}
                aria-label={`${link.label} categories`}
                role="region"
                data-open={open}
                className="mega-panel bg-background absolute inset-x-0 top-full"
              >
                <div className="container-page pt-6 pb-12">
                  {department ? <Panel department={department} /> : <PanelSkeleton />}
                </div>
              </div>
            </li>
          );
        })}
        <li className="h-full">
          <Link href="/products?sort=newest" className={cn(TOP_LINK, "text-foreground/80 hover:text-foreground")}>
            New
          </Link>
        </li>
      </ul>
    </nav>
  );
}

function Panel({ department }: { department: NavDepartment }) {
  const popular = popularTypes(department);
  return (
    <div className="grid grid-cols-4 gap-10">
      {department.groups.map((group) => (
        <div key={group.path}>
          <Link
            href={categoryHref(department.slug, group.path)}
            prefetch={false}
            data-mega-link
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mb-4 inline-block rounded-md text-xs font-medium outline-none transition-colors focus-visible:ring-3"
          >
            {group.name}
          </Link>
          <ul className="space-y-0.5">
            {group.children.slice(0, SUBCATEGORIES_SHOWN).map((sub) => (
              <li key={sub.path}>
                <Link href={categoryHref(department.slug, sub.path)} prefetch={false} data-mega-link className={PANEL_LINK}>
                  {sub.name}
                </Link>
              </li>
            ))}
            {group.children.length > SUBCATEGORIES_SHOWN && (
              <li>
                <Link
                  href={categoryHref(department.slug, group.path)}
                  prefetch={false}
                  data-mega-link
                  className={cn(PANEL_LINK, "text-brand mt-1 text-sm font-normal hover:underline")}
                >
                  View all {group.name.toLowerCase()}
                </Link>
              </li>
            )}
          </ul>
        </div>
      ))}
      <div>
        <p className="text-muted-foreground mb-4 text-xs font-medium">Popular</p>
        <ul className="space-y-0.5">
          {popular.map((type) => (
            <li key={type.path}>
              <Link href={categoryHref(department.slug, type.path)} prefetch={false} data-mega-link className={PANEL_LINK}>
                {type.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-10" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          {[0, 1, 2, 3, 4].map((j) => (
            <Skeleton key={j} className="h-3.5 w-32" />
          ))}
        </div>
      ))}
    </div>
  );
}
