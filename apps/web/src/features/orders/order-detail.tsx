import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatAddress } from "@/features/account/address-form";
import { displayPhone } from "@/features/account/mongolia";
import { productPath } from "@/features/catalog/product";
import { useFormat } from "@/i18n/use-format";
import { StatusBadge } from "./status-badge";
import type { Order } from "./orders-api";
import Image from "next/image";

/**
 * Мөр, нийт дүн, хүргэлтийн мэдээлэл яг төлсөн хэлбэрээрээ (үнэ нь snapshot). `reviewLinks` нь
 * ирсэн захиалгын мөр бүрд "Write a review" холбоос нэмнэ.
 */
export function OrderDetail({ order, reviewLinks = false }: { order: Order; reviewLinks?: boolean }) {
  const t = useTranslations("orders.detail");
  const format = useFormat();
  // Захиалга өөрийн валютаараа (хуучин USD захиалга ч байж болно).
  const money = (cents: number) => format.price(cents, order.currency);
  const date = format.date(order.created_at, { dateStyle: "long" });
  const address = order.shipping_address;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 type-caption">
        <StatusBadge status={order.status} />
        <span className="text-muted-foreground">{t("placed", { date })}</span>
      </div>

      <ul className="divide-border divide-y" aria-label={t("items")}>
        {order.items.map((item) => (
          <li key={`${item.product_id}-${item.size}`} className="flex gap-3 py-4 first:pt-0">
            <Link
              href={`/products/${item.product_id}/${item.slug}`}
              className="bg-muted relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-xl sm:w-20"
            >
              <Image src={item.image.thumb_400} alt={item.name} width={400} height={533} sizes="80px" className="size-full object-cover" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={productPath({ id: item.product_id, slug: item.slug })} className="line-clamp-2 type-caption font-medium hover:underline">
                {item.name}
              </Link>
              <p className="text-muted-foreground type-fine">
                {t(item.size ? "lineMetaSize" : "lineMeta", {
                  size: item.size ?? "",
                  quantity: item.quantity,
                  price: money(item.unit_price_cents),
                })}
              </p>
              {reviewLinks && order.status === "delivered" && (
                <Link
                  href={`${productPath({ id: item.product_id, slug: item.slug })}#reviews`}
                  className="text-brand w-fit type-fine hover:underline"
                >
                  {t("writeReview")} <span className="sr-only">{t("writeReviewFor", { name: item.name })}</span>
                </Link>
              )}
            </div>
            <span className="type-caption font-medium tabular-nums">{money(item.line_total_cents)}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="delivery-heading" className="space-y-2 type-caption">
          <h2 id="delivery-heading" className="font-semibold">
            {t("delivery")}
          </h2>
          <p>{address.full_name}</p>
          <p className="text-muted-foreground">{formatAddress(address)}</p>
          {address.phone && <p className="text-muted-foreground tabular-nums">{displayPhone(address.phone)}</p>}
          <p className="text-muted-foreground">{t(`methods.${order.shipping_method}`)}</p>
          <p className="text-muted-foreground">{t("confirmationSent", { email: order.contact_email })}</p>
        </section>
        <section aria-labelledby="totals-heading" className="space-y-2 type-caption">
          <h2 id="totals-heading" className="font-semibold">
            {t("payment")}
          </h2>
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("subtotal")}</dt>
              <dd>
                <span className="tabular-nums">{money(order.subtotal_cents)}</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("shipping")}</dt>
              <dd>{order.shipping_cents === 0 ? t("free") : <span className="tabular-nums">{money(order.shipping_cents)}</span>}</dd>
            </div>
            <div className="border-border flex justify-between border-t pt-2 type-body font-semibold">
              <dt>{t("total")}</dt>
              <dd>
                <span className="tabular-nums">
                  {money(order.total_cents)}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
