import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  aside?: ReactNode;
};

/**
 * Сонгох боломжтой карт хэлбэртэй radio (хаяг, хүргэлтийн төрөл). Native radio keyboard-ийн
 * ажиллагааг хадгална.
 */
export function ChoiceCard({ name, value, checked, onChange, children, aside }: Props) {
  return (
    <label
      className={cn(
        "border-field bg-card hover:border-foreground has-focus-visible:ring-ring/60 flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-[0.9375rem] transition-[border-color,box-shadow] has-focus-visible:ring-3",
        checked && "border-primary shadow-[0_0_0_1px_var(--primary)]",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="accent-primary mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 space-y-0.5">{children}</span>
      {aside && <span className="shrink-0 font-medium">{aside}</span>}
    </label>
  );
}
