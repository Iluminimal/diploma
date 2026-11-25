import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/features/catalog/product";
import { useFormat } from "@/i18n/use-format";
import { cn } from "@/lib/utils";
import type { OrdersTranslator } from "./orders-translator";

export type TimelineEvent = { type: string; at: string; data: Record<string, unknown> };

const CANCEL_REASONS = ["expired", "admin", "customer", "amount_mismatch", "payment_canceled", "replaced", "payment_setup_failed"] as const;
const AUTOMATIC_REFUNDS = ["order_cancelled", "amount_mismatch"] as const;

function oneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const cents = (value: unknown) => (typeof value === "number" ? value : undefined);

/** Үйл явдал юу гэж хэлэх вэ, үгээр. Өгөгдөлд байхгүйг (үйлчлүүлэгч бага зүйл харна) орхино. */
export function describeEvent(
  event: TimelineEvent,
  currency: string,
  t: OrdersTranslator,
  price: (cents: number, currency: string) => string = formatPrice,
) {
  const { data } = event;
  const money = cents(data.amount_cents);
  const lines: string[] = [];
  let title: string;
  switch (event.type) {
    case "placed":
      title = t("events.placed");
      break;
    case "paid":
      title = t("events.paid");
      if (money !== undefined) lines.push(price(money, currency));
      break;
    case "shipped": {
      title = t("events.shipped");
      const carrier = text(data.carrier);
      const tracking = text(data.tracking_number);
      if (carrier) lines.push(t("events.withCarrier", { carrier }));
      if (tracking) lines.push(t("events.tracking", { number: tracking }));
      break;
    }
    case "delivered":
      title = t("events.delivered");
      break;
    case "cancelled": {
      title = t("events.cancelled");
      const reason = text(data.reason);
      if (reason) lines.push(oneOf(CANCEL_REASONS, reason) ? t(`events.cancelReasons.${reason}`) : reason);
      break;
    }
    case "refunded": {
      title = data.automatic === true ? t("events.refundedAuto") : t("events.refunded");
      if (money !== undefined) lines.push(price(money, currency));
      const reason = text(data.reason);
      if (reason) lines.push(oneOf(AUTOMATIC_REFUNDS, reason) ? t(`events.refundReasons.${reason}`) : reason);
      if (data.restock === true) lines.push(t("events.restocked"));
      if (data.restock === false) lines.push(t("events.notRestocked"));
      break;
    }
    case "note":
      title = t("events.note");
      if (text(data.text)) lines.push(text(data.text)!);
      break;
    default:
      title = event.type;
  }
  return { title, lines, actor: text(data.actor) };
}

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/** Захиалгын түүх босоо жагсаалтаар. Админ хэн юу хийснийг, тэдний тэмдэглэлийг харна. */
export function OrderTimeline({
  events,
  currency,
  newestFirst = false,
  label,
}: {
  events: readonly TimelineEvent[];
  currency: string;
  newestFirst?: boolean;
  label?: string;
}) {
  const t = useTranslations("orders");
  const format = useFormat();
  const ordered = newestFirst ? [...events].reverse() : events;
  return (
    <ol aria-label={label ?? t("events.history")} className="space-y-0">
      {ordered.map((event, index) => {
        const { title, lines, actor } = describeEvent(event, currency, t, format.price);
        const last = index === ordered.length - 1;
        return (
          <li key={`${event.type}-${event.at}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="bg-border absolute top-6 bottom-0 left-[0.6875rem] w-px" />}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 grid size-[1.375rem] shrink-0 place-items-center rounded-full",
                event.type === "note" ? "bg-muted text-muted-foreground" : "bg-foreground text-background",
              )}
            >
              <Check className="size-3" />
            </span>
            <div className="min-w-0 space-y-0.5 type-caption">
              <p className="font-medium">{title}</p>
              {lines.map((line) => (
                <p key={line} className={cn("text-muted-foreground break-words", event.type === "note" && "text-foreground")}>
                  {line}
                </p>
              ))}
              <p className="text-muted-foreground type-fine">
                <time dateTime={event.at}>{format.dateTime(event.at, WHEN)}</time>
                {actor ? ` · ${actor}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
