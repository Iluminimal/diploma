import Link from "next/link";
import { FREE_SHIPPING_FROM_USD } from "./store-promises";

/** The thin line above the header, like a department store's: a real offer and the shop's big idea. */
export function PromoStrip() {
  return (
    <section aria-label="Announcement" className="bg-foreground text-background text-xs">
      <p className="container-page flex min-h-9 flex-wrap items-center justify-center gap-x-4 gap-y-0.5 py-1.5 text-center">
        <span>Free standard shipping on orders over ${FREE_SHIPPING_FROM_USD}</span>
        <Link href="/search" className="underline underline-offset-4 hover:no-underline focus-visible:ring-background/60 rounded-sm outline-none focus-visible:ring-2">
          Search any look with a photo
        </Link>
      </p>
    </section>
  );
}
