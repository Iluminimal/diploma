import { Check } from "lucide-react";
import { formatPrice } from "@/features/catalog/product";
import { cn } from "@/lib/utils";

export type TimelineEvent = { type: string; at: string; data: Record<string, unknown> };

const CANCEL_REASONS: Record<string, string> = {
  expired: "Not paid in time",
  admin: "Cancelled by the shop",
  amount_mismatch: "The amount paid did not match",
  payment_canceled: "The payment was cancelled",
  replaced: "Replaced by a newer checkout",
  payment_setup_failed: "Payment could not be set up",
};
const AUTOMATIC_REFUNDS: Record<string, string> = {
  order_cancelled: "The payment arrived after the order was cancelled",
  amount_mismatch: "The amount paid did not match the order",
};

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const cents = (value: unknown) => (typeof value === "number" ? value : undefined);

/** Үйл явдал юу гэж хэлэх вэ, үгээр. Өгөгдөлд байхгүйг (үйлчлүүлэгч бага зүйл харна) орхино. */
export function describeEvent(event: TimelineEvent, currency: string) {
  const { data } = event;
  const money = cents(data.amount_cents);
  const lines: string[] = [];
  let title: string;
  switch (event.type) {
    case "placed":
      title = "Order placed";
      break;
    case "paid":
      title = "Payment received";
      if (money !== undefined) lines.push(formatPrice(money, currency));
      break;
    case "shipped": {
      title = "Shipped";
      const carrier = text(data.carrier);
      const tracking = text(data.tracking_number);
      if (carrier) lines.push(`With ${carrier}`);
      if (tracking) lines.push(`Tracking number ${tracking}`);
      break;
    }
    case "delivered":
      title = "Delivered";
      break;
    case "cancelled": {
      title = "Cancelled";
      const reason = text(data.reason);
      if (reason) lines.push(CANCEL_REASONS[reason] ?? reason);
      break;
    }
    case "refunded": {
      title = data.automatic === true ? "Refunded automatically" : "Refunded";
      if (money !== undefined) lines.push(formatPrice(money, currency));
      const reason = text(data.reason);
      if (reason) lines.push(AUTOMATIC_REFUNDS[reason] ?? reason);
      if (data.restock === true) lines.push("Items returned to stock");
      if (data.restock === false) lines.push("Items not returned to stock");
      break;
    }
    case "note":
      title = "Note";
      if (text(data.text)) lines.push(text(data.text)!);
      break;
    default:
      title = event.type;
  }
  return { title, lines, actor: text(data.actor) };
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/** Захиалгын түүх босоо жагсаалтаар. Админ хэн юу хийснийг, тэдний тэмдэглэлийг харна. */
export function OrderTimeline({
  events,
  currency,
  newestFirst = false,
  label = "Order history",
}: {
  events: readonly TimelineEvent[];
  currency: string;
  newestFirst?: boolean;
  label?: string;
}) {
  const ordered = newestFirst ? [...events].reverse() : events;
  return (
    <ol aria-label={label} className="space-y-0">
      {ordered.map((event, index) => {
        const { title, lines, actor } = describeEvent(event, currency);
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
            <div className="min-w-0 space-y-0.5 text-sm">
              <p className="font-medium">{title}</p>
              {lines.map((line) => (
                <p key={line} className={cn("text-muted-foreground break-words", event.type === "note" && "text-foreground")}>
                  {line}
                </p>
              ))}
              <p className="text-muted-foreground text-xs">
                <time dateTime={event.at}>{when(event.at)}</time>
                {actor ? ` · ${actor}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
