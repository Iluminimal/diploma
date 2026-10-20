"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  as?: "div" | "li" | "section" | "p";
  /** Хүлээх секунд; ах дүү элементүүдийг жижиг үржвэрээр stagger хий. */
  delay?: number;
  /** Дээш өгсөх зай, px-ээр. */
  y?: number;
  /** `view`: scroll хийж харагдах үед (fold-оос доор). `mount`: гарч ирмэгц. */
  when?: "view" | "mount";
  className?: string;
};

/**
 * Нэг удаа бүдэг байдлаас гарч байрандаа орно. Animation нь өөрөө CSS (globals.css дахь
 * `[data-reveal]`); энэ нь зөвхөн зөв мөчид `data-in`-ыг асаадаг тул animation сан татах
 * шаардлагагүй. Эхний дэлгэцийн хамгийн том элементийг үүнд бүү оро: харагдахгүй эхэлдэг тул
 * хуудасны largest contentful paint-ыг хойшлуулна. Script-гүй эсвэл reduced motion-той бол агуулга
 * зүгээр л харагдана.
 */
export function Reveal({ children, as = "div", delay = 0, y = 18, when = "view", className }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const show = () => element.setAttribute("data-in", "");
    if (when === "mount" || typeof IntersectionObserver === "undefined") {
      // Нэг frame хойно, ингэснээр нуугдсан төлөв эхлээд зурагдаж, өөрчлөлт нь transition болно.
      const frame = requestAnimationFrame(show);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [when]);

  const Component = as as ElementType;
  return (
    <Component
      ref={ref}
      data-reveal=""
      className={className}
      style={{ "--reveal-delay": `${delay}s`, "--reveal-y": `${y}px` } as CSSProperties}
    >
      {children}
    </Component>
  );
}
