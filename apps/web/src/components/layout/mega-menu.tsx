"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPARTMENT_LINKS, categoryHref, popularTypes, type NavDepartment } from "@/features/catalog/nav";
import { useCatalogNav } from "@/features/catalog/use-catalog-nav";
import { cn } from "@/lib/utils";
import { announceFlyout, useCloseOnOtherFlyout } from "./bar-flyout";

// Timings in the spirit of apple.com's global nav: a flyout opens after a short hover, switching
// from one department to another is immediate, and it closes a beat after the pointer has left.
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;
const SUBCATEGORIES_SHOWN = 8;
// The flyout fills the viewport under the bar (the bar is 2.75rem plus its 1px border).
const FLYOUT_HEIGHT = "calc(100dvh - 2.8125rem)";

const TOP_LINK =
  "focus-visible:ring-ring/60 flex h-full items-center rounded-md px-1.5 text-xs outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-inset";

const PANEL_LINK =
  "hover:text-brand focus-visible:ring-ring/60 -mx-2 block rounded-md px-2 py-1 text-[1.0625rem] leading-snug font-semibold tracking-tight outline-none transition-colors duration-150 focus-visible:ring-3";

/**
 * The department menu, behaving like apple.com's global navigation.
 *
 * - The entries in the bar are ordinary links (they work before any script or data arrive).
 * - Hovering one opens **one shared flyout** under the bar; moving to another entry swaps its
 *   content at once. The flyout is a solid panel as tall as the viewport under the bar. Leaving the
 *   bar and flyout, or moving onto the empty part below the links, closes it a moment later; hovering an entry that has no flyout ("New") closes it.
 * - While it is open the bar turns solid, so bar and flyout read as one surface
 *   (see `.mega-*` in globals.css). The links fade in one after another.
 * - Touch: the first tap on an entry opens its flyout, the second follows the link.
 * - Keyboard: ArrowLeft / ArrowRight / Home / End move between the entries in the bar (and, while a
 *   flyout is open, switch it along); ArrowDown on an entry opens its flyout and moves into it;
 *   Escape closes it and returns to the entry; focus leaving the menu closes it.
 */
export function MegaMenu() {
  const pathname = usePathname();
  const [wanted, setWanted] = useState(false);
  // Remember where the flyout was opened: after a navigation it counts as closed, without an effect.
  const [opened, setOpened] = useState<{ slug: string; pathname: string } | null>(null);
  const openSlug = opened && opened.pathname === pathname ? opened.slug : null;
  const open = openSlug !== null;
  const timer = useRef<number | undefined>(undefined);
  const lastPointer = useRef<string>("mouse");
  const { data } = useCatalogNav(wanted);

  function setOpenSlug(slug: string | null) {
    setOpened(slug ? { slug, pathname } : null);
    // The search or the Bag that was open under the bar makes way.
    if (slug) announceFlyout("menu");
  }
  useCloseOnOtherFlyout("menu", () => setOpened(null));

  // Warm the data shortly after the page settles, so the first hover is instant.
  useEffect(() => {
    const id = window.setTimeout(() => setWanted(true), 2500);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function schedule(next: string | null, delay: number) {
    window.clearTimeout(timer.current);
    if (delay === 0) setOpenSlug(next);
    else timer.current = window.setTimeout(() => setOpenSlug(next), delay);
  }

  const mouse = (event: PointerEvent) => event.pointerType === "mouse";

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && openSlug) {
      const slug = openSlug;
      setOpenSlug(null);
      event.currentTarget.querySelector<HTMLElement>(`[data-mega-trigger="${slug}"]`)?.focus();
    } else if (
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) &&
      event.target instanceof HTMLElement &&
      "megaTop" in event.target.dataset
    ) {
      const entries = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-mega-top]")];
      const at = entries.indexOf(event.target);
      const to =
        event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : at + (event.key === "ArrowRight" ? 1 : -1);
      const entry = entries[to];
      if (!entry) return;
      event.preventDefault();
      entry.focus();
      // With a flyout open, the one under the new entry replaces it (none for an entry without one).
      if (openSlug) setOpenSlug(entry.dataset.megaTrigger && data ? entry.dataset.megaTrigger : null);
    } else if (event.key === "ArrowDown" && event.target instanceof HTMLElement && "megaTrigger" in event.target.dataset) {
      const slug = event.target.dataset.megaTrigger!;
      if (!data?.departments.some((d) => d.slug === slug)) return;
      event.preventDefault();
      setOpenSlug(slug);
      // The content becomes visible on the next render; focus then.
      const nav = event.currentTarget;
      requestAnimationFrame(() => nav.querySelector<HTMLElement>(`#mega-${slug} [data-mega-link]`)?.focus());
    }
  }

  function onTriggerClick(event: MouseEvent, slug: string) {
    // A tap (not a click with a mouse, not Enter on the keyboard) on an entry whose flyout is
    // closed opens the flyout instead of leaving the page.
    if (event.detail > 0 && lastPointer.current !== "mouse" && openSlug !== slug) {
      event.preventDefault();
      setWanted(true);
      setOpenSlug(slug);
    }
  }

  return (
    <nav
      aria-label="Main"
      className="hidden flex-1 self-stretch md:block"
      onPointerDownCapture={(event) => {
        lastPointer.current = event.pointerType;
      }}
      onPointerEnter={() => setWanted(true)}
      onFocus={() => setWanted(true)}
      onPointerLeave={(event) => mouse(event) && schedule(null, CLOSE_DELAY_MS)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenSlug(null);
      }}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (!event.defaultPrevented && (event.target as Element).closest("a")) setOpenSlug(null);
      }}
    >
      <ul className="flex h-full items-center justify-center gap-7">
        {DEPARTMENT_LINKS.map((link) => {
          const department = data?.departments.find((d) => d.slug === link.slug);
          const active = openSlug === link.slug;
          return (
            <li
              key={link.slug}
              className="h-full"
              onPointerEnter={(event) => mouse(event) && schedule(link.slug, open ? 0 : OPEN_DELAY_MS)}
            >
              <Link
                href={categoryHref(link.slug)}
                data-mega-trigger={link.slug}
                data-mega-top
                aria-expanded={department ? active : undefined}
                aria-controls={department ? `mega-${link.slug}` : undefined}
                onClick={(event) => onTriggerClick(event, link.slug)}
                className={cn(TOP_LINK, active ? "text-foreground" : "text-foreground/80 hover:text-foreground")}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <li className="h-full" onPointerEnter={(event) => mouse(event) && schedule(null, open ? 120 : 0)}>
          <Link href="/products?sort=newest" data-mega-top className={cn(TOP_LINK, "text-foreground/80 hover:text-foreground")}>
            New
          </Link>
        </li>
      </ul>

      <div
        className="mega-flyout bg-background absolute inset-x-0 top-full overflow-y-auto overscroll-contain"
        data-open={open}
        style={{ height: open ? FLYOUT_HEIGHT : 0 }}
        onPointerEnter={(event) => mouse(event) && window.clearTimeout(timer.current)}
      >
        {/* The empty part below the links: moving onto it, or tapping it, closes the flyout. */}
        <div
          aria-hidden
          className="absolute inset-0"
          onPointerEnter={(event) => mouse(event) && schedule(null, CLOSE_DELAY_MS)}
          onClick={() => setOpenSlug(null)}
        />
        <div className="relative">
          {DEPARTMENT_LINKS.map((link) => {
            const department = data?.departments.find((d) => d.slug === link.slug);
            return (
              <div
                key={link.slug}
                id={`mega-${link.slug}`}
                role="region"
                aria-label={`${link.label} categories`}
                data-active={openSlug === link.slug}
                className="mega-content container-nav"
              >
                <div className="pt-6 pb-12">{department ? <Panel department={department} /> : <PanelSkeleton />}</div>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** Each link gets a position in the fade-in sequence (`--i`, see `.mega-item`). */
const step = (column: number, row: number): CSSProperties => ({ "--i": column * 3 + row }) as CSSProperties;

function Panel({ department }: { department: NavDepartment }) {
  const popular = popularTypes(department);
  return (
    <div className="grid grid-cols-4 gap-10">
      {department.groups.map((group, column) => (
        <div key={group.path}>
          <Link
            href={categoryHref(department.slug, group.path)}
            prefetch={false}
            data-mega-link
            style={step(column, 0)}
            className="mega-item text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 mb-4 block w-fit rounded-md text-xs font-medium outline-none transition-colors focus-visible:ring-3"
          >
            {group.name}
          </Link>
          <ul className="space-y-0.5">
            {group.children.slice(0, SUBCATEGORIES_SHOWN).map((sub, row) => (
              <li key={sub.path} className="mega-item" style={step(column, row + 1)}>
                <Link href={categoryHref(department.slug, sub.path)} prefetch={false} data-mega-link className={PANEL_LINK}>
                  {sub.name}
                </Link>
              </li>
            ))}
            {group.children.length > SUBCATEGORIES_SHOWN && (
              <li className="mega-item" style={step(column, SUBCATEGORIES_SHOWN + 1)}>
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
        <p className="mega-item text-muted-foreground mb-4 text-xs font-medium" style={step(department.groups.length, 0)}>
          Popular
        </p>
        <ul className="space-y-0.5">
          {popular.map((type, row) => (
            <li key={type.path} className="mega-item" style={step(department.groups.length, row + 1)}>
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
