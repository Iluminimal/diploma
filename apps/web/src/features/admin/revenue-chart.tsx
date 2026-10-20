import { formatPrice } from "@/features/catalog/product";
import type { AdminStats } from "./admin-api";
import { bars, niceCeiling } from "./stats";

const day = (
  iso: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });

/**
 * Өдөр тутмын орлогыг баганаар харуулна. Chart library ашиглахгүй гараар зурсан: баганууд нь SVG,
 * тэмдэглэгээ нь текст тул утсан дээр бүдгэрэх, жижгэрэхгүй. Яг тоонуудыг screen reader болон
 * хүссэн хүнд зориулж доор нь хүснэгтээр өгсөн.
 */
export function RevenueChart({ stats }: { stats: AdminStats }) {
  const { series, currency } = stats;
  const total = series.reduce((sum, point) => sum + point.revenue_cents, 0);
  const ceiling = niceCeiling(
    Math.max(...series.map((point) => point.revenue_cents), 0),
  );
  const shape = bars(
    series.map((point) => point.revenue_cents),
    ceiling,
  );
  const compact = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div
          aria-hidden
          className="text-muted-foreground flex h-44 flex-col justify-between text-right text-xs tabular-nums"
        >
          <span>{compact.format(ceiling / 100)}</span>
          <span>{compact.format(ceiling / 200)}</span>
          <span>{compact.format(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            role="img"
            aria-label={`Daily revenue over the last ${series.length} days: ${formatPrice(total, currency)} in total`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-44 w-full overflow-visible"
          >
            {[0, 50, 100].map((y) => (
              <line
                key={y}
                x1="0"
                x2="100"
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={y === 100 ? 0.35 : 0.12}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {shape.map((bar, index) => {
              const point = series[index]!;
              return (
                <rect
                  key={point.date}
                  x={bar.x}
                  width={bar.width}
                  y={100 - bar.height}
                  height={bar.height}
                  rx="0.6"
                  className="fill-brand"
                >
                  <title>
                    {day(point.date)}:{" "}
                    {formatPrice(point.revenue_cents, currency)} from{" "}
                    {point.orders} {point.orders === 1 ? "order" : "orders"}
                  </title>
                </rect>
              );
            })}
          </svg>
          {first && last && (
            <div
              aria-hidden
              className="text-muted-foreground mt-1.5 flex justify-between text-xs"
            >
              <span>{day(first.date)}</span>
              <span>{day(last.date)}</span>
            </div>
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-brand focus-visible:ring-ring/60 w-fit cursor-pointer rounded-md outline-none hover:underline focus-visible:ring-3">
          Show the figures as a table
        </summary>
        <div
          // Гүйлгэдэг хэсэгт keyboard-оор хүрэх боломжтой байх ёстой.
          tabIndex={0}
          role="region"
          aria-label="Daily revenue and orders"
          className="border-border mt-3 max-h-72 overflow-auto rounded-xl border"
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Revenue and orders for each day, oldest first
            </caption>
            <thead className="bg-muted/60 text-muted-foreground sticky top-0 text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Day
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Orders
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {series.map((point) => (
                <tr key={point.date}>
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {day(point.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {point.orders}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatPrice(point.revenue_cents, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
