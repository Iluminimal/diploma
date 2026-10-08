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

/** A radio styled as a selectable card (addresses, shipping methods). Native radios keep the keyboard behaviour. */
export function ChoiceCard({ name, value, checked, onChange, children, aside }: Props) {
  return (
    <label
      className={cn(
        "border-input hover:border-foreground/60 has-focus-visible:ring-ring/60 flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors has-focus-visible:ring-3",
        checked && "border-foreground bg-muted/40",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="accent-foreground mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 space-y-0.5">{children}</span>
      {aside && <span className="shrink-0 font-medium">{aside}</span>}
    </label>
  );
}
