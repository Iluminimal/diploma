"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * 1-5 од сонгоно. Radio button-уудын бүлэг тул сумны товч, label, screen reader бусад сонголттой
 * адил ажиллана; од бол radio-ны харагдах байдал.
 */
export function RatingInput({
  value,
  onChange,
  error,
  name = "rating",
}: {
  value: number;
  onChange: (rating: number) => void;
  error?: string;
  name?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined} className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">Your rating</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((stars) => (
          <label
            key={stars}
            onMouseEnter={() => setHover(stars)}
            className="focus-within:ring-ring/60 relative cursor-pointer rounded-md p-0.5 focus-within:ring-3"
          >
            <input
              type="radio"
              name={name}
              value={stars}
              checked={value === stars}
              onChange={() => onChange(stars)}
              className="sr-only"
            />
            <span className="sr-only">
              {stars} {stars === 1 ? "star" : "stars"}, {WORDS[stars - 1]}
            </span>
            <Star aria-hidden className={cn("size-7 text-amber-500 transition-colors", stars <= shown ? "fill-current" : "text-muted-foreground/40")} />
          </label>
        ))}
        <span aria-hidden className="text-muted-foreground ml-2 text-sm">
          {shown ? WORDS[shown - 1] : ""}
        </span>
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </fieldset>
  );
}
