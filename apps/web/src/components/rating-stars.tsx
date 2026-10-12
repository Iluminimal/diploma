import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const FIVE = [0, 1, 2, 3, 4];

/** "4.5 out of 5 stars", or "4 out of 5 stars" for a whole number. */
export function ratingLabel(rating: number) {
  const shown = Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
  return `${shown} out of 5 stars`;
}

/**
 * Five stars filled to the rating (halves and quarters included). The picture is for the eye; the
 * words ("4.5 out of 5 stars") are what a screen reader gets.
 */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const clamped = Math.min(Math.max(rating, 0), 5);
  const stars = (filled: boolean) =>
    FIVE.map((i) => <Star key={i} aria-hidden className={cn("size-4 shrink-0", filled && "fill-current")} />);
  return (
    <span role="img" aria-label={ratingLabel(clamped)} className={cn("relative inline-flex h-4 w-20 text-amber-500", className)}>
      <span aria-hidden className="text-muted-foreground/40 absolute inset-0 flex">
        {stars(false)}
      </span>
      <span aria-hidden className="absolute inset-y-0 left-0 flex overflow-hidden" style={{ width: `${(clamped / 5) * 100}%` }}>
        <span className="flex h-full w-20 shrink-0">{stars(true)}</span>
      </span>
    </span>
  );
}
