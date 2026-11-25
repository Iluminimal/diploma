import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { categoryHref } from "@/features/catalog/nav";
import type { Product } from "@/features/catalog/product";
import { cn } from "@/lib/utils";
import { popular } from "./home-data";

const DEPARTMENTS = ["women", "men", "kids"] as const;
/** Department бүрийн шошгын цэгийн өнгө (GitHub-ийн акцентууд, цайвар болон хар дэвсгэр дээр харагдана). */
const DOT: Record<(typeof DEPARTMENTS)[number], string> = { women: "#db61a2", men: "#2f81f7", kids: "#2da44e" };
type Department = (typeof DEPARTMENTS)[number];

/** Department-ийн зураг: хоёр дахь хамгийн эрэлттэй хувцас (дээрх "Эрэлттэй" shelf-ийн эхний бараатай давхцахгүй). */
async function picture(slug: string): Promise<Product | undefined> {
  const items = await popular({ department: slug, category: "apparel" }, 2);
  return items[1] ?? items[0];
}

/**
 * Хүрээтэй card: дээр зураг, доор `● Эмэгтэй  ↗` (өнгөт цэг). Card бүхлээрээ нэг холбоос (нэг tab stop).
 * hover дээр хүрээ цэнхэрээр гэрэлтэж зураг зөөлөн томорно (`gh-card`, `zoom-on-hover`), scroll-д дараалан орно.
 */
function DepartmentCard({ department, label, product, index }: { department: Department; label: string; product?: Product; index: number }) {
  return (
    <Link
      href={categoryHref(department)}
      style={{ "--i": index } as CSSProperties}
      className="view-rise tile gh-card zoom-on-hover group focus-visible:ring-ring/50 flex flex-col outline-none focus-visible:ring-3"
    >
      <div className="relative aspect-4/5 overflow-hidden bg-white">
        {product && (
          <Image
            aria-hidden
            src={product.image.thumb_800}
            alt=""
            fill
            // Hero-ийн зураг (LCP)-тай булаацалдахгүй: энэ нь эхний дэлгэцээс доор.
            fetchPriority="low"
            sizes="(min-width: 768px) 33vw, 100vw"
            placeholder={product.image.blur_data_url ? "blur" : "empty"}
            blurDataURL={product.image.blur_data_url ?? undefined}
            className={cn("reveal-scale object-cover", department === "kids" ? "object-center" : "object-top")}
          />
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-border px-4 py-3.5">
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: DOT[department] }} />
        <h2 className="text-lg font-semibold tracking-tight -ml-1">{label}</h2>
        <ArrowUpRight aria-hidden className="text-muted-foreground group-hover:text-foreground ml-auto size-5 transition-[color,transform] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}

/** Гурван тэнцүү card; утсан дээр нэг багана. Card-ын өндөр нь зургийн харьцаагаар тогтдог (CLS 0). */
export async function Departments() {
  const [[women, men, kids], t] = await Promise.all([
    Promise.all(DEPARTMENTS.map((d) => picture(d))),
    getTranslations("home.departments"),
  ]);
  const products = { women, men, kids };
  return (
    <div className="container-page grid gap-4 py-16 md:grid-cols-3 md:py-24">
      {DEPARTMENTS.map((d, i) => (
        <DepartmentCard key={d} department={d} label={t(`${d}.label`)} product={products[d]} index={i} />
      ))}
    </div>
  );
}
