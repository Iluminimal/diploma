import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/i18n/use-format";
import { cn } from "@/lib/utils";
import type { OrdersTranslator } from "./orders-translator";

type Progress = {
  status: string;
  created_at: string;
  paid_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  refunded_at?: string | null;
  cancelled_at?: string | null;
};

type Step = { key: string; label: string; at?: string | null; done: boolean; stopped?: boolean };

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/**
 * Захиалгын туулсан алхмууд ба одоогийн алхам. Цуцлагдсан эсвэл буцаагдсан захиалга өөрийн алхмаар
 * төгсөнө.
 */
export function orderSteps(order: Progress, t: OrdersTranslator): Step[] {
  const flow: Step[] = [
    { key: "placed", label: t("progress.placed"), at: order.created_at, done: true },
    { key: "paid", label: t("status.paid"), at: order.paid_at, done: Boolean(order.paid_at) },
    { key: "shipped", label: t("status.shipped"), at: order.shipped_at, done: Boolean(order.shipped_at) },
    { key: "delivered", label: t("status.delivered"), at: order.delivered_at, done: Boolean(order.delivered_at) },
  ];
  if (order.status === "cancelled") {
    return [flow[0]!, { key: "cancelled", label: t("status.cancelled"), at: order.cancelled_at, done: true, stopped: true }];
  }
  if (order.status === "refunded") {
    return [
      ...flow.filter((step) => step.done),
      { key: "refunded", label: t("status.refunded"), at: order.refunded_at, done: true, stopped: true },
    ];
  }
  return flow;
}

export function OrderProgress({ order, className }: { order: Progress; className?: string }) {
  const t = useTranslations("orders");
  const format = useFormat();
  const steps = orderSteps(order, t);
  const current = steps.reduce((last, step, index) => (step.done ? index : last), 0);
  return (
    <ol aria-label={t("progress.label")} className={cn("flex", className)}>
      {steps.map((step, index) => {
        // Сүүлийн алхамд хүрсэн бол захиалга дууссан: "явагдаж байна" биш, биелсэн.
        const finished = step.done && index === steps.length - 1;
        const state = step.stopped
          ? "stopped"
          : index < current || finished
            ? "done"
            : index === current
              ? "current"
              : "upcoming";
        return (
          <li
            key={step.key}
            aria-current={index === current ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
          >
            {index > 0 && (
              <span aria-hidden className="bg-border absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2">
                {step.done && (
                  // Хуудас ачаалахад өмнөх алхмаас дүүрч эхэлнэ, холбогч бүр дараалан.
                  <span
                    className={cn(
                      "animate-grow absolute inset-0 origin-left",
                      step.stopped ? "bg-destructive/40" : "bg-foreground",
                    )}
                    style={{ animationDelay: `${(index - 1) * 160}ms` }}
                  />
                )}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-7 place-items-center rounded-full border-2 type-fine font-semibold",
                state === "stopped" && "border-destructive bg-destructive text-white",
                state === "done" && "border-foreground bg-foreground text-background",
                state === "current" && "border-foreground bg-background text-foreground",
                state === "upcoming" && "border-border bg-background text-muted-foreground",
              )}
            >
              {state === "stopped" ? <X className="size-3.5" /> : state === "done" ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={cn("type-fine font-medium sm:type-caption", state === "upcoming" && "text-muted-foreground")}>
              {step.label}
              <span className="sr-only">
                {t(state === "upcoming" ? "progress.notYet" : state === "current" ? "progress.current" : "progress.done")}
              </span>
            </span>
            <span className="text-muted-foreground min-h-4 type-fine">{step.at ? format.date(step.at, DAY) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}
