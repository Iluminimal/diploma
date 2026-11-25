"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { monotonePath, type Point } from "@/components/admin/chart-math";
import { formatPrice } from "@/features/catalog/product";
import { DEFAULT_LOCALE, INTL_LOCALE, isLocale } from "@/i18n/config";
import type { AdminStats } from "./admin-api";
import { niceCeiling } from "./stats";

const day = (
  iso: string,
  tag: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(tag, {
    ...options,
    timeZone: "UTC",
  });

const W = 100;
const H = 100;

/**
 * Өдөр тутмын орлогыг талбайт муруйгаар харуулна (Apple Stocks/Health шиг): нимгэн тор, градиент,
 * hover дээр босоо шугам ба тайлбар. Chart library ашиглахгүй гараар зурсан: утсан дээр бүдгэрэх,
 * жижгэрэхгүй. Яг тоонуудыг screen reader болон хүссэн хүнд зориулж доор нь хүснэгтээр өгсөн.
 */
export function RevenueChart({ stats }: { stats: AdminStats }) {
  const t = useTranslations("admin.chart");
  const locale = useLocale();
  const tag = INTL_LOCALE[isLocale(locale) ? locale : DEFAULT_LOCALE];
  const gradient = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { series, currency } = stats;
  const total = series.reduce((sum, point) => sum + point.revenue_cents, 0);
  const ceiling = niceCeiling(Math.max(...series.map((point) => point.revenue_cents), 0));
  // Тэнхлэгийн дээд хязгаарыг (ceiling) 100%, тэгийг 0% гэж авч, цэг бүрийг баруун ирмэг хүртэл тараана.
  const step = series.length > 1 ? W / (series.length - 1) : W;
  const points: Point[] = series.map((point, index) => [
    series.length > 1 ? Number((index * step).toFixed(2)) : W / 2,
    Number((H - (point.revenue_cents / ceiling) * H).toFixed(2)),
  ]);
  const line = monotonePath(points);
  const area = points.length ? `${line} L${points[points.length - 1]![0]} ${H} L${points[0]![0]} ${H} Z` : "";
  const compact = new Intl.NumberFormat(tag, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const first = series[0];
  const last = series[series.length - 1];
  const active = hover === null ? null : { point: series[hover]!, at: points[hover]! };

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div aria-hidden className="text-muted-foreground flex h-52 flex-col justify-between text-right text-xs tabular-nums">
          <span>{compact.format(ceiling / 100)}</span>
          <span>{compact.format(ceiling / 200)}</span>
          <span>{compact.format(0)}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            role="img"
            aria-label={t("aria", { days: series.length, total: formatPrice(total, currency, tag) })}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-52 w-full overflow-visible"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 50, 100].map((y) => (
              <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeOpacity={y === 100 ? 0.3 : 0.1} vectorEffect="non-scaling-stroke" />
            ))}
            {area && <path d={area} fill={`url(#${gradient})`} />}
            {line && <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {active && <line x1={active.at[0]} x2={active.at[0]} y1="0" y2={H} stroke="currentColor" strokeOpacity="0.25" vectorEffect="non-scaling-stroke" />}
            {series.map((point, index) => (
              <rect
                key={point.date}
                x={points[index]![0] - step / 2}
                y="0"
                width={step}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onMouseMove={() => setHover(index)}
              />
            ))}
          </svg>
          {active && (
            <>
              <span
                aria-hidden
                className="bg-brand ring-background pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                style={{ left: `${active.at[0]}%`, top: `${active.at[1]}%` }}
              />
              <div
                aria-hidden
                className="bg-popover/90 pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl px-3 py-2 text-xs shadow-[var(--elevation-soft)] ring-1 ring-[var(--admin-hairline)] backdrop-blur-xl"
                style={{ left: `clamp(15%, ${active.at[0]}%, 85%)`, top: -8, transform: "translate(-50%, -100%)" }}
              >
                <p className="text-muted-foreground">{day(active.point.date, tag, { weekday: "short", month: "short", day: "numeric" })}</p>
                <p className="text-foreground font-semibold tabular-nums">{formatPrice(active.point.revenue_cents, currency, tag)}</p>
                <p className="text-muted-foreground">{t("tooltipOrders", { count: active.point.orders })}</p>
              </div>
            </>
          )}
          {first && last && (
            <div aria-hidden className="text-muted-foreground mt-1.5 flex justify-between text-xs">
              <span>{day(first.date, tag)}</span>
              <span>{day(last.date, tag)}</span>
            </div>
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-brand focus-visible:ring-ring/50 w-fit cursor-pointer rounded-md outline-none hover:underline focus-visible:ring-3">
          {t("show")}
        </summary>
        <div
          // Гүйлгэдэг хэсэгт keyboard-оор хүрэх боломжтой байх ёстой.
          tabIndex={0}
          role="region"
          aria-label={t("region")}
          className="border-border/70 mt-3 max-h-72 overflow-auto rounded-xl border"
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="bg-muted/60 text-muted-foreground sticky top-0 text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t("day")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("orders")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("revenue")}</th>
              </tr>
            </thead>
            <tbody className="divide-border/70 divide-y">
              {series.map((point) => (
                <tr key={point.date}>
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {day(point.date, tag, { weekday: "short", month: "short", day: "numeric" })}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.orders}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatPrice(point.revenue_cents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
