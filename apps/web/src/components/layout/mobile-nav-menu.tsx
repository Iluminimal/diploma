"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEPARTMENT_LINKS,
  categoryHref,
  type CatalogNav,
  type NavNode,
} from "@/features/catalog/nav";
import { useCatalogNav } from "@/features/catalog/use-catalog-nav";
import { cn } from "@/lib/utils";

/** One step of the drill-down: where "Shop all" goes and what lies below it. */
type Step = { name: string; href: string; children: Step[] };

function fromNode(department: string, node: NavNode): Step {
  return {
    name: node.name,
    href: categoryHref(department, node.path),
    children: node.children.map((child) => fromNode(department, child)),
  };
}

function departments(nav: CatalogNav | undefined): Step[] {
  return DEPARTMENT_LINKS.map((link) => {
    const department = nav?.departments.find((d) => d.slug === link.slug);
    return {
      name: link.label,
      href: categoryHref(link.slug),
      children: department ? department.groups.map((group) => fromNode(link.slug, group)) : [],
    };
  });
}

const row = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * The page that opens under the phone header when the menu button is pressed, as on apple.com: the
 * shop in large type, each line fading in after the one above, and nothing else (the search and the
 * account are the magnifier's and the Bag's pages). Departments
 * drill down level by level (Men > Clothing > Topwear). It covers the page below the bar (the bar
 * itself stays, but only its button, now an X; the rest fades out), the page behind it cannot scroll or be reached, and Escape
 * closes it and returns focus to the button. Portalled to <body> because the header's backdrop
 * blur would otherwise be the containing block of anything `fixed` inside it.
 */
export function MobileMenuPanel({
  open,
  onClose,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState<Step[]>([]);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const { data, isPending } = useCatalogNav(open);

  // Closed: the next opening starts at the top.
  if (!open && stack.length > 0) setStack([]);

  useEffect(() => {
    if (!open) return;
    // The page behind is out of reach (no scrolling, no tabbing into it) while the menu is open.
    const behind = document.querySelectorAll("#main, footer");
    behind.forEach((element) => element.setAttribute("inert", ""));
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onClose();
      trigger.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      behind.forEach((element) => element.removeAttribute("inert"));
      root.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, trigger]);

  const root: Step = { name: "Menu", href: "/", children: departments(data) };
  const current = stack.at(-1) ?? root;
  const top = stack.length === 0;
  const big = top ? "text-[1.75rem] leading-tight font-semibold tracking-tight" : "text-xl font-semibold tracking-tight";

  return createPortal(
    <div
      id="mobile-menu"
      ref={panel}
      role="dialog"
      aria-label="Menu"
      data-open={open}
      inert={!open}
      className="menu-panel bg-background fixed inset-x-0 top-12 bottom-0 z-30 overflow-y-auto overscroll-contain md:hidden"
    >
      <div className="container-page pt-4 pb-16">
        {!top && (
          <button
            type="button"
            onClick={() => {
              setDirection("back");
              setStack(stack.slice(0, -1));
            }}
            aria-label={`Back to ${stack.length > 1 ? stack[stack.length - 2]!.name : "menu"}`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 -ml-1 mb-3 inline-flex items-center gap-1 rounded-md py-1 pr-2 text-sm outline-none focus-visible:ring-3"
          >
            <ChevronLeft aria-hidden className="size-4" /> {stack.length > 1 ? stack[stack.length - 2]!.name : "Menu"}
          </button>
        )}

        <nav
          key={stack.length}
          aria-label={top ? "Main" : current.name}
          className={cn(
            "animate-in fade-in-0 flex flex-col duration-300",
            direction === "forward" ? "slide-in-from-right-6" : "slide-in-from-left-6",
          )}
        >
          {!top && <h2 className="mb-2 text-3xl font-semibold tracking-tight">{current.name}</h2>}
          {!top && (
            <Link href={current.href} onClick={onClose} className={cn(big, "menu-row py-2")} style={row(1)}>
              Shop all {current.name}
            </Link>
          )}
          {!top && current.children.length === 0 && isPending && <MenuSkeleton />}
          {current.children.map((step, i) =>
            step.children.length > 0 ? (
              <button
                key={step.href}
                type="button"
                className={cn(big, "menu-row flex w-full items-center justify-between py-2 text-left")}
                style={row(i + 1)}
                onClick={() => {
                  setDirection("forward");
                  setStack([...stack, step]);
                }}
              >
                {step.name}
                <ChevronRight aria-hidden className="text-muted-foreground size-5" />
              </button>
            ) : (
              <Link key={step.href} href={step.href} onClick={onClose} className={cn(big, "menu-row py-2")} style={row(i + 1)}>
                {step.name}
              </Link>
            ),
          )}
          {top && (
            <Link
              href="/products?sort=newest"
              onClick={onClose}
              className={cn(big, "menu-row py-2")}
              style={row(current.children.length + 1)}
            >
              New
            </Link>
          )}
        </nav>

      </div>
    </div>,
    document.body,
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-4 py-4" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-6 w-44" />
      ))}
    </div>
  );
}
