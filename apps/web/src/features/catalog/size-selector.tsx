"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  sizes: string[];
  /** Sold-out products show the sizes but cannot be selected. */
  disabled?: boolean;
};

export function SizeSelector({ label, sizes, disabled }: Props) {
  const name = useId();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="flex w-full items-baseline justify-between text-sm font-medium">
        <span>{label}</span>
        <span className="text-muted-foreground text-xs font-normal" aria-live="polite">
          {selected ? `Selected: ${selected}` : "Select a size"}
        </span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const id = `${name}-${size}`;
          return (
            <div key={size}>
              <input
                id={id}
                type="radio"
                name={name}
                value={size}
                checked={selected === size}
                onChange={() => setSelected(size)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "border-input bg-background flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-xl border px-3.5 text-sm font-medium transition-colors select-none",
                  "hover:border-foreground peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background",
                  "peer-focus-visible:ring-ring/60 peer-focus-visible:ring-3 peer-disabled:cursor-not-allowed peer-disabled:opacity-40 peer-disabled:hover:border-input",
                )}
              >
                {size}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
