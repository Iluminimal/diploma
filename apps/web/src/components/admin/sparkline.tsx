import { monotonePath, type Point } from "./chart-math";
import { cn } from "@/lib/utils";

const W = 100;
const H = 28;

/**
 * KPI-ийн хажуугийн жижиг чиг хандлагын муруй. Чимэглэл (`aria-hidden`): яг утга нь KPI-ийн тоон дээр
 * байдаг. Дор хаяж хоёр цэг, бүгд тэг биш бол л зурна, үгүй бол юу ч харуулахгүй (хуурамч шулуун
 * шугам төөрөгдүүлнэ).
 */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length < 2 || values.every((value) => value === 0)) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = W / (values.length - 1);
  const points: Point[] = values.map((value, index) => [
    Number((index * step).toFixed(2)),
    Number((H - 2 - ((value - min) / range) * (H - 4)).toFixed(2)),
  ]);
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-7 w-full", className)}>
      <path
        d={monotonePath(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
