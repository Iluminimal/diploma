import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "hero" | "half" | "full";

const HEIGHT: Record<Size, string> = {
  hero: "min-h-[36rem] md:min-h-[43rem]",
  half: "min-h-[32rem] md:min-h-[36rem]",
  full: "min-h-[30rem] md:min-h-[36rem]",
};

/**
 * apple.com-ын нүүр хуудасны tile: захаас захад, төвлөрсөн гарчиг ба текстийн мөр, нэг юмуу хоёр
 * pill товч, доор нь зураг. Цайвар tile нь саарал `#f5f5f7`, хар нь хар. Хэмжээ нь apple.com дээр
 * хэмжсэнтэй ижил: эхний tile-д 56px, бусдад 40px гарчиг, 692px ба 580px өндөр.
 */
export function Tile({
  tone = "light",
  size,
  label,
  heading,
  as: Heading = "h2",
  subtitle,
  actions,
  animate = true,
  className,
  children,
}: {
  tone?: "light" | "dark";
  size: Size;
  /** Бүс нутгийг туслах технологид (a11y) нэрлэнэ. */
  label: string;
  heading: ReactNode;
  as?: "h1" | "h2";
  subtitle?: ReactNode;
  actions?: ReactNode;
  /**
   * Tile дэлгэцэнд орох үед үгс тогтож гарна. Эхний tile-д унтраана, учир нь түүний гарчиг хэзээ ч
   * animation хийгддэггүй.
   */
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <section
      aria-label={label}
      className={cn(
        "relative flex flex-col items-center overflow-hidden text-center",
        // Хар tile бол dark-mode арал: холбоосын цэнхэр нь хар дэвсгэр дээр харагдах цайвар
        // хувилбар.
        dark ? "dark bg-black text-white" : "bg-secondary text-foreground",
        HEIGHT[size],
        className,
      )}
    >
      <div className={cn("px-4 pt-12 md:pt-14", animate && "tile-copy")}>
        <Heading
          className={cn(
            "text-balance font-semibold",
            size === "hero"
              ? "text-[2.5rem] leading-[1.1] tracking-[-0.009em] md:text-[3.5rem] md:leading-[1.07143] md:tracking-[-0.005em]"
              : "text-[2rem] leading-[1.125] tracking-[0.004em] md:text-[2.5rem] md:leading-[1.1] md:tracking-normal",
          )}
        >
          {heading}
        </Heading>
        {subtitle && (
          <p className={cn("mx-auto mt-2 max-w-xl text-balance", size === "hero" ? "text-[1.3125rem] leading-[1.2] md:text-[1.75rem]" : "text-[1.3125rem] leading-[1.2]", dark && "text-white/80")}>
            {subtitle}
          </p>
        )}
        {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
