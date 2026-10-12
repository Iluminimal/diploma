import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const FIVE = [0, 1, 2, 3, 4];

// The row is five stars wide; the clipped, filled copy is as wide as the row.
const SIZES = {
  sm: { row: "h-3 w-[3.75rem]", star: "size-3" },
  md: { row: "h-4 w-20", star: "size-4" },
  lg: { row: "h-5 w-[6.25rem]", star: "size-5" },
} as const;

/** "4.5 out of 5 stars", or "4 out of 5 stars" for a whole number. */
export function ratingLabel(rating: number) {
  const shown = Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
  return `${shown} out of 5 stars`;
}

/**
 * Five stars filled to the rating (halves and quarters included). The picture is for the eye; the
 * words ("4.5 out of 5 stars") are what a screen reader gets.
 */
export function RatingStars({
  rating,
  size = "md",
  className,
}: {
  rating: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const clamped = Math.min(Math.max(rating, 0), 5);
  const { row, star } = SIZES[size];
  const stars = (filled: boolean) =>
    FIVE.map((i) => <Star key={i} aria-hidden className={cn("shrink-0", star, filled && "fill-current")} />);
  return (
    <span role="img" aria-label={ratingLabel(clamped)} className={cn("relative inline-flex text-amber-500", row, className)}>
      <span aria-hidden className="text-muted-foreground/40 absolute inset-0 flex">
        {stars(false)}
      </span>
      <span aria-hidden className="absolute inset-y-0 left-0 flex overflow-hidden" style={{ width: `${(clamped / 5) * 100}%` }}>
        <span className={cn("flex shrink-0", row)}>{stars(true)}</span>
      </span>
    </span>
  );
}
