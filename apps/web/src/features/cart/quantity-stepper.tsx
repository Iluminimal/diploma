import { useTranslations } from "next-intl";
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
  const t = useTranslations("cart");
  const button =
    "grid size-9 place-items-center rounded-full transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-ring/50 focus-visible:ring-3 outline-none";
  return (
    <div className={cn("border-input inline-flex items-center rounded-full border", className)}>
      <button
        type="button"
        className={button}
        aria-label={t("decrease", { name })}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-6 overflow-hidden text-center type-caption font-medium tabular-nums" aria-live="polite">
        {/* Шинэ key нь орох animation-ыг дахин тоглуулна: шинэ тоо байраа олж дээшилнэ. */}
        <span key={value} className="animate-in fade-in slide-in-from-bottom-1 block duration-300">
          {value}
        </span>
      </span>
      <button
        type="button"
        className={button}
        aria-label={t("increase", { name })}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
