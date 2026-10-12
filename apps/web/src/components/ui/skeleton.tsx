import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // A soft highlight sweeps across (transform only, so it costs no layout or paint).
        "relative overflow-hidden rounded-md bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-linear-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
