"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;

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
  const t = useTranslations("reviews.rating");
  const word = (stars: number) => t(`words.${String(stars) as "1" | "2" | "3" | "4" | "5"}`);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined} className="space-y-1.5">
      <legend className="mb-1.5 type-caption font-medium">{t("label")}</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {STARS.map((stars) => (
          <label
            key={stars}
            onMouseEnter={() => setHover(stars)}
            className="focus-within:ring-ring/50 relative cursor-pointer rounded-md p-0.5 focus-within:ring-3"
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
              {t("option", { stars, word: word(stars) })}
            </span>
            <Star aria-hidden className={cn("size-7 text-star transition-colors", stars <= shown ? "fill-current" : "text-muted-foreground/40")} />
          </label>
        ))}
        <span aria-hidden className="text-muted-foreground ml-2 type-caption">
          {shown ? word(shown) : ""}
        </span>
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="text-destructive type-fine">
          {error}
        </p>
      )}
    </fieldset>
  );
}
