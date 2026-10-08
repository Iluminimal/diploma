import Link from "next/link";
import { Price } from "@/components/price";
import { formatAddress } from "@/features/account/address-form";
import { productPath } from "@/features/catalog/product";
import { StatusBadge } from "./status-badge";
import type { Order } from "./orders-api";
import Image from "next/image";

const METHOD_LABELS = { standard: "Standard shipping", express: "Express shipping" } as const;

/** Lines, totals and delivery details exactly as they were charged (prices are snapshots). */
export function OrderDetail({ order }: { order: Order }) {
  const date = new Date(order.created_at).toLocaleDateString("en-US", { dateStyle: "long" });
  const address = order.shipping_address;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <StatusBadge status={order.status} />
        <span className="text-muted-foreground">Placed {date}</span>
      </div>

      <ul className="divide-border divide-y" aria-label="Items in this order">
        {order.items.map((item) => (
          <li key={`${item.product_id}-${item.size}`} className="flex gap-3 py-4 first:pt-0">
            <Link
              href={`/products/${item.product_id}/${item.slug}`}
              className="bg-muted relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-xl sm:w-20"
            >
              <Image src={item.image.thumb_400} alt={item.name} width={400} height={533} sizes="80px" className="size-full object-cover" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={productPath({ id: item.product_id, slug: item.slug })} className="line-clamp-2 text-sm font-medium hover:underline">
                {item.name}
              </Link>
              <p className="text-muted-foreground text-xs">
                {item.size ? `Size ${item.size} · ` : ""}Qty {item.quantity} ·{" "}
                <Price cents={item.unit_price_cents} currency={order.currency} /> each
              </p>
            </div>
            <Price cents={item.line_total_cents} currency={order.currency} className="text-sm font-medium" />
          </li>
        ))}
      </ul>

      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="delivery-heading" className="space-y-2 text-sm">
          <h2 id="delivery-heading" className="font-semibold">
            Delivery
          </h2>
          <p>{address.full_name}</p>
          <p className="text-muted-foreground">{formatAddress(address)}</p>
          <p className="text-muted-foreground">{METHOD_LABELS[order.shipping_method]}</p>
          <p className="text-muted-foreground">Confirmation sent to {order.contact_email}</p>
        </section>
        <section aria-labelledby="totals-heading" className="space-y-2 text-sm">
          <h2 id="totals-heading" className="font-semibold">
            Payment summary
          </h2>
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>
                <Price cents={order.subtotal_cents} currency={order.currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>{order.shipping_cents === 0 ? "Free" : <Price cents={order.shipping_cents} currency={order.currency} />}</dd>
            </div>
            <div className="border-border flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>
                <Price cents={order.total_cents} currency={order.currency} />
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
