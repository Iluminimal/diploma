"use client";

import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCOUNT_LINKS } from "@/features/auth/account-links";
import { useAuth } from "@/features/auth/auth-store";
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

const ITEM = "border-border flex w-full items-center justify-between border-b py-3.5 text-left text-base";

/**
 * The slide-out menu on phones: departments drill down level by level (Men > Clothing > Topwear),
 * each step sliding in from the side. Loaded on first tap (see `MobileNav`): it needs the dialog
 * library.
 */
export function MobileNavMenu({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [stack, setStack] = useState<Step[]>([]);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const status = useAuth((state) => state.status);
  const { data, isPending } = useCatalogNav(open);

  const root: Step = { name: "Menu", href: "/", children: departments(data) };
  const current = stack.at(-1) ?? root;
  const close = () => {
    setOpen(false);
    setStack([]);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 overflow-hidden">
        <SheetHeader className="flex-row items-center gap-1">
          {stack.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Back to ${stack.length > 1 ? stack[stack.length - 2]!.name : "menu"}`}
              onClick={() => {
                setDirection("back");
                setStack(stack.slice(0, -1));
              }}
            >
              <ChevronLeft />
            </Button>
          )}
          <SheetTitle>{current.name}</SheetTitle>
        </SheetHeader>
        <nav
          key={stack.length}
          aria-label={stack.length === 0 ? "Main" : current.name}
          className={cn(
            "animate-in fade-in-0 flex flex-1 flex-col overflow-y-auto px-4 duration-300",
            direction === "forward" ? "slide-in-from-right-8" : "slide-in-from-left-8",
          )}
        >
          {stack.length > 0 && (
            <Link href={current.href} onClick={close} className={cn(ITEM, "font-semibold")}>
              Shop all {current.name}
            </Link>
          )}
          {stack.length > 0 && current.children.length === 0 && isPending && <MenuSkeleton />}
          {current.children.map((step) =>
            step.children.length > 0 ? (
              <button
                key={step.href}
                type="button"
                className={ITEM}
                onClick={() => {
                  setDirection("forward");
                  setStack([...stack, step]);
                }}
              >
                <span className={cn(stack.length === 0 && "font-medium")}>{step.name}</span>
                <ChevronRight className="text-muted-foreground size-4" aria-hidden />
              </button>
            ) : (
              <Link key={step.href} href={step.href} onClick={close} className={cn(ITEM, stack.length === 0 && "font-medium")}>
                {step.name}
              </Link>
            ),
          )}
          {stack.length === 0 && (
            <>
              <Link href="/products?sort=newest" onClick={close} className={cn(ITEM, "font-medium")}>
                New
              </Link>
              {status === "signedIn" ? (
                ACCOUNT_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} onClick={close} className={cn(ITEM, "text-muted-foreground")}>
                    {link.label}
                  </Link>
                ))
              ) : (
                <Link href="/login" onClick={close} className={cn(ITEM, "text-muted-foreground")}>
                  Sign in
                </Link>
              )}
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-4 py-4" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-5 w-40" />
      ))}
    </div>
  );
}
