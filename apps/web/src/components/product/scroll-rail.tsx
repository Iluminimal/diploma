"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Native scroll-snap carousel; сумнууд нь pointer хэрэглэгчдэд зориулсан нэмэлт.
 *
 * Энд `scroll-smooth` class НЭМЭХГҮЙ: snap-тэй хамт хуудас ачаалах үед smooth-scroll animation
 * эхлүүлж, Chrome хуудасны largest paint-ыг хэдэн зуун миллисекунд хоцорч мэдээлэхэд хүргэнэ (нүүр
 * хуудсан дээр Lighthouse LCP 88 -> 92). Сумнууд өөрсдөө smooth scroll хүсдэг.
 */
export function ScrollRail({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLUListElement>(null);

  function scrollBy(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <div className="group/rail relative">
      <ul
        ref={ref}
        aria-label={label}
        tabIndex={0}
        className="hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:gap-5 sm:px-6 lg:mx-0 lg:px-0 focus-visible:ring-ring/60 rounded-2xl outline-none focus-visible:ring-3"
      >
        {children}
      </ul>
      <div className="pointer-events-none absolute inset-y-0 -right-3 -left-3 hidden items-center justify-between lg:flex">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
          className="shadow-soft pointer-events-auto rounded-full opacity-0 transition-opacity group-hover/rail:opacity-100 focus-visible:opacity-100"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
          className="shadow-soft pointer-events-auto rounded-full opacity-0 transition-opacity group-hover/rail:opacity-100 focus-visible:opacity-100"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function RailItem({ children }: { children: ReactNode }) {
  return <li className="w-[44vw] max-w-56 shrink-0 snap-start sm:w-52 lg:w-60 lg:max-w-none">{children}</li>;
}
