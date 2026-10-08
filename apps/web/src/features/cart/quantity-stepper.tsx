import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  max: number;
  name: string;
  onChange: (quantity: number) => void;
  className?: string;
};

export function QuantityStepper({ value, max, name, onChange, className }: Props) {
  const button =
    "grid size-9 place-items-center rounded-full transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-ring/60 focus-visible:ring-3 outline-none";
  return (
    <div className={cn("border-input inline-flex items-center rounded-full border", className)}>
      <button
        type="button"
        className={button}
        aria-label={`Decrease quantity of ${name}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-6 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={button}
        aria-label={`Increase quantity of ${name}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
