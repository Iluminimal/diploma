import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"select"> & {
  /** `field`: маягтын талбар (`Input`-тай ижил өндөр, хүрээ). `pill`: хэрэгслийн мөрийн жижиг сонгогч. */
  variant?: "field" | "pill";
};

/**
 * Apple хэвийн native `<select>` (chevron-той). Native хэвээр үлдсэн тул гар утсан дээр системийн
 * сонгогч нээгдэж, keyboard болон screen reader өөрөө ажиллана; `react-hook-form`-ын `register`
 * шууд ажиллана. Хуучин `selectClass`, admin `NativeSelect`-ийг орлоно.
 */
export function NativeSelect({ className, children, variant = "field", ...props }: Props) {
  return (
    <span className={cn("relative inline-flex", variant === "field" && "w-full", className)}>
      <select
        data-slot="native-select"
        {...props}
        className={cn(
          "text-foreground focus-visible:ring-ring/50 w-full cursor-pointer appearance-none outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
          variant === "field"
            ? "border-field bg-card focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 type-body h-11 rounded-xl border pr-10 pl-4 aria-invalid:ring-3"
            : "bg-muted type-caption h-9 rounded-full border-0 py-0 pr-9 pl-4 font-medium",
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 size-4 -translate-y-1/2",
          variant === "field" ? "right-3.5" : "right-3",
        )}
      />
    </span>
  );
}
