"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPARTMENT_LINKS, categoryHref, popularTypes, type NavDepartment } from "@/features/catalog/nav";
import { useCatalogNav } from "@/features/catalog/use-catalog-nav";
import { cn } from "@/lib/utils";
import { announceFlyout, useCloseOnOtherFlyout } from "./bar-flyout";
import { useBarPanel } from "./bar-panel";

// apple.com-ийн global nav-ийн хугацаатай ойролцоо: flyout богино hover-ийн дараа нээгдэнэ, нэг
// department-ээс нөгөө рүү шилжихэд шууд, курсор гарснаас хойш бага зэрэг хугацааны дараа хаагдана.
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;
const SUBCATEGORIES_SHOWN = 8;

// apple.com шиг bar дахь холбоос: 12px үсэг, хоёр талд 8px, bar-тай ижил өндөр, focus ring нь
// bar-ыг дүүргэхийн оронд текстийг (6px дотогш) тойрно.
const TOP_LINK =
  "focus-visible:outline-ring flex h-full items-center px-2 text-xs outline-none transition-colors duration-200 focus-visible:rounded-[5px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-6";

// Flyout дахь холбоосны хоёр хэмжээ: эхний баганын том (24px) ба жижиг (12px, 24px зайтай).
const BIG_LINK =
  "hover:text-brand focus-visible:ring-ring/60 -mx-2 block rounded-md px-2 py-[5px] text-2xl leading-7 font-semibold outline-none transition-colors duration-150 focus-visible:ring-3";
const SMALL_LINK =
  "hover:text-brand focus-visible:ring-ring/60 -mx-2 block rounded-md px-2 py-1 text-xs leading-4 font-semibold outline-none transition-colors duration-150 focus-visible:ring-3";
const HEADING = "text-muted-foreground mb-[11px] block w-fit text-xs leading-4";

/**
 * Department цэс, apple.com-ийн global navigation шиг ажиллана.
 *
 * - Bar дахь элементүүд энгийн холбоос (script, өгөгдөл ирэхээс өмнө ч ажиллана).
 * - Нэг элемент дээр hover хийхэд bar-ын доор **нэг нийтлэг flyout** нээгдэнэ; өөр элемент рүү
 *   шилжихэд агуулга нь шууд солигдоно. Flyout нь агуулгынхаа өндөртэй panel (харуулж буй
 *   department-ийн өндрийг дагана), доорх хуудсыг curtain (`BarCurtain`) бүрхэж бүдгэрүүлнэ. Bar
 *   болон flyout-оос гарах эсвэл curtain дээр очвол бага хугацааны дараа хаагдана; flyout-гүй
 *   элемент ("New") дээр hover хийхэд хаагдана.
 * - Нээлттэй байхад bar flyout-ын өнгийг авч, bar ба flyout нэг гадаргуу шиг харагдана (globals.css
 *   дахь `.mega-*`-ыг үз). Холбоосууд нэг нэгээр нь гарна.
 * - Элементүүд logo, icon-уудтай хамт bar дээр apple.com шиг жигд тархана: энэ nav ба жагсаалт нь
 *   `display: contents` тул элемент бүр header-ийн мөрийн нэг item болно.
 * - Touch: элемент дээр эхний товшилт flyout-ыг нээж, хоёр дахь нь холбоосоор явна.
 * - Keyboard: ArrowLeft / ArrowRight / Home / End bar дахь элементүүдийн хооронд шилжинэ (flyout
 *   нээлттэй бол түүнийг дагуулна); элемент дээр ArrowDown flyout-ыг нээж дотор нь орно; Escape
 *   хааж элемент рүү буцаана; focus цэснээс гарвал хаагдана.
 */
export function MegaMenu() {
  const pathname = usePathname();
  const [wanted, setWanted] = useState(false);
  // Flyout хаана нээгдсэнийг санана: навигацийн дараа effect-гүйгээр хаагдсан гэж тооцогдоно.
  const [opened, setOpened] = useState<{ slug: string; pathname: string } | null>(null);
  const openSlug = opened && opened.pathname === pathname ? opened.slug : null;
  const open = openSlug !== null;
  const timer = useRef<number | undefined>(undefined);
  const lastPointer = useRef<string>("mouse");
  const { data } = useCatalogNav(wanted);
  useBarPanel(open);

  // Flyout нь харуулж буй department-ийнхээ өндөртэй: тэр агуулгын өндрийг дага (бусад нь flow-оос
  // гадна).
  const content = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setContentHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function setOpenSlug(slug: string | null) {
    setOpened(slug ? { slug, pathname } : null);
    // Bar-ын доор нээлттэй байсан хайлт эсвэл Bag зай тавьж өгнө.
    if (slug) announceFlyout("menu");
  }
  useCloseOnOtherFlyout("menu", () => setOpened(null));

  // Хуудас тогтсоны дараа өгөгдлийг түрүүлж ачаалж, эхний hover шууд болно.
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
      // Flyout нээлттэй үед шинэ элементийн flyout түүнийг орлоно (flyout-гүй элементэд байхгүй).
      if (openSlug) setOpenSlug(entry.dataset.megaTrigger && data ? entry.dataset.megaTrigger : null);
    } else if (event.key === "ArrowDown" && event.target instanceof HTMLElement && "megaTrigger" in event.target.dataset) {
      const slug = event.target.dataset.megaTrigger!;
      if (!data?.departments.some((d) => d.slug === slug)) return;
      event.preventDefault();
      setOpenSlug(slug);
      // Агуулга дараагийн render дээр харагдана; тэгээд focus тавина.
      const nav = event.currentTarget;
      requestAnimationFrame(() => nav.querySelector<HTMLElement>(`#mega-${slug} [data-mega-link]`)?.focus());
    }
  }

  function onTriggerClick(event: MouseEvent, slug: string) {
    // Flyout хаалттай элемент дээр товшилт (mouse click, keyboard Enter биш) хуудаснаас гарахын
    // оронд flyout-ыг нээнэ.
    if (event.detail > 0 && lastPointer.current !== "mouse" && openSlug !== slug) {
      event.preventDefault();
      setWanted(true);
      setOpenSlug(slug);
    }
  }

  return (
    <nav
      aria-label="Main"
      className="hidden md:contents"
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
      <ul className="contents">
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
        className="mega-flyout absolute inset-x-0 top-full max-h-[calc(100dvh-2.8125rem)] overflow-y-auto overscroll-contain bg-[var(--flyout)]"
        data-open={open}
        style={{ height: open ? contentHeight : 0 }}
        onPointerEnter={(event) => mouse(event) && window.clearTimeout(timer.current)}
      >
        <div ref={content} className="relative">
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
                <div className="pt-9 pb-20">{department ? <Panel department={department} /> : <PanelSkeleton />}</div>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** Холбоос бүр fade-in дарааллын байрлалаа авна (`--i`, `.mega-item`-ыг үз). */
const step = (column: number, row: number): CSSProperties => ({ "--i": column * 3 + row }) as CSSProperties;

/**
 * apple.com-ийн flyout шиг: эхний багана том холбоос (түгээмэл барааны төрөл, 24px), дараа нь
 * department-ийн бүлэг бүрт жижиг (12px) холбоосны нэг багана, тус бүр жижиг саарал гарчигтай.
 */
function Panel({ department }: { department: NavDepartment }) {
  const popular = popularTypes(department);
  return (
    <div className="grid gap-x-8" style={{ gridTemplateColumns: `1.5fr repeat(${department.groups.length}, minmax(0, 1fr))` }}>
      <div>
        <p className={cn(HEADING, "mega-item")} style={step(0, 0)}>
          Popular in {department.name}
        </p>
        <ul>
          {popular.map((type, row) => (
            <li key={type.path} className="mega-item" style={step(0, row + 1)}>
              <Link href={categoryHref(department.slug, type.path)} prefetch={false} data-mega-link className={BIG_LINK}>
                {type.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {department.groups.map((group, column) => (
        <div key={group.path}>
          <Link
            href={categoryHref(department.slug, group.path)}
            prefetch={false}
            data-mega-link
            style={step(column + 1, 0)}
            className={cn(HEADING, "mega-item hover:text-foreground focus-visible:ring-ring/60 rounded-md outline-none transition-colors focus-visible:ring-3")}
          >
            {group.name}
          </Link>
          <ul>
            {group.children.slice(0, SUBCATEGORIES_SHOWN).map((sub, row) => (
              <li key={sub.path} className="mega-item" style={step(column + 1, row + 1)}>
                <Link href={categoryHref(department.slug, sub.path)} prefetch={false} data-mega-link className={SMALL_LINK}>
                  {sub.name}
                </Link>
              </li>
            ))}
            {group.children.length > SUBCATEGORIES_SHOWN && (
              <li className="mega-item" style={step(column + 1, SUBCATEGORIES_SHOWN + 1)}>
                <Link
                  href={categoryHref(department.slug, group.path)}
                  prefetch={false}
                  data-mega-link
                  className={cn(SMALL_LINK, "text-brand hover:underline")}
                >
                  View all {group.name.toLowerCase()}
                </Link>
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-8" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-3 w-24" />
          {[0, 1, 2, 3, 4].map((j) => (
            <Skeleton key={j} className={i === 0 ? "h-6 w-40" : "h-3 w-28"} />
          ))}
        </div>
      ))}
    </div>
  );
}
