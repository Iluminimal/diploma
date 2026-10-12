import { CreditCard, Heart, ShoppingBag } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/reveal";
import { listProducts } from "@/features/catalog/api";
import { emptyFilters } from "@/features/catalog/filters";
import type { Product } from "@/features/catalog/product";

const BENEFITS = [
  { icon: ShoppingBag, text: "Your Bag follows you from phone to laptop" },
  { icon: Heart, text: "Save favourites and come back to them" },
  { icon: CreditCard, text: "Every order and address in one place" },
] as const;

/** Real catalogue photos for the side panel. The page works without them (API down). */
async function panelProducts(): Promise<Product[]> {
  try {
    const { items } = await listProducts({ ...emptyFilters(), in_stock: true, sort: "newest", page: 1 }, 3);
    return items;
  } catch {
    return [];
  }
}

const TILT = ["-rotate-6 translate-y-6", "rotate-0 -translate-y-2 z-10", "rotate-6 translate-y-8"];

/**
 * Sign in and sign up pages: the form on one side and, on wide screens, a calm dark panel with a
 * few products and what an account is for. The panel is decoration; phones just get the form.
 */
export async function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const products = await panelProducts();
  return (
    <div className="container-page grid min-h-[calc(100dvh-9rem)] items-center gap-12 py-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-16">
      <Reveal when="mount" y={16} className="mx-auto w-full max-w-sm space-y-6">
        <header className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tighter">{title}</h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </header>
        {children}
      </Reveal>

      <aside
        aria-hidden
        className="relative hidden min-h-[34rem] flex-col justify-between overflow-hidden rounded-[2rem] bg-neutral-950 p-10 text-white lg:flex"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,oklch(0.52_0.17_268/0.45),transparent)]" />
        <p className="relative max-w-xs text-2xl leading-tight font-semibold tracking-tight text-balance">
          Found something you love? Keep it close.
        </p>
        {products.length > 0 && (
          <div className="relative my-6 flex items-center justify-center gap-3">
            {products.map((product, i) => (
              <div
                key={product.id}
                className={`animate-float w-36 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/10 xl:w-40 ${TILT[i]}`}
                style={{ animationDelay: `${i * 0.8}s` }}
              >
                <Image
                  src={product.image.thumb_400}
                  alt=""
                  width={400}
                  height={533}
                  sizes="160px"
                  className="aspect-3/4 w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
        <ul className="relative space-y-3">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/80">
              <span className="grid size-8 place-items-center rounded-full bg-white/10">
                <Icon aria-hidden className="size-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
