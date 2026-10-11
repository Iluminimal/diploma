import { CreditCard, ShieldCheck, Truck } from "lucide-react";
import { FREE_SHIPPING_FROM_USD } from "./store-promises";

// Only things that are true of this shop today.
const ITEMS = [
  { icon: Truck, title: `Free shipping over $${FREE_SHIPPING_FROM_USD}`, text: "Standard delivery is on us for bigger orders." },
  { icon: ShieldCheck, title: "Your photos stay yours", text: "A photo is used for the search and never stored." },
  { icon: CreditCard, title: "A demo store", text: "Checkout uses test payments: no real money moves." },
] as const;

export function TrustStrip() {
  return (
    <section aria-label="Good to know" className="bg-secondary">
      <ul className="container-page grid gap-8 py-12 md:grid-cols-3 md:gap-10">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-4">
            <span className="bg-background grid size-11 shrink-0 place-items-center rounded-full">
              <Icon aria-hidden className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-0.5 text-sm">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
