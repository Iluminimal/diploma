"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const LENGTH = 6;

/**
 * Six boxes for a one-time code. Typing moves ahead, Backspace steps back, a pasted (or
 * autofilled) code spreads over the boxes, and `onComplete` fires when the last digit lands.
 * `invalid` shakes the boxes once; the shake is a CSS animation and stops for reduced motion.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  invalid = false,
  disabled = false,
  autoFocus = false,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  function focusBox(index: number) {
    refs.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus();
  }

  function fill(from: number, text: string) {
    const typed = text.replace(/\D/g, "");
    if (!typed) return;
    const next = (value.slice(0, from) + typed).slice(0, LENGTH);
    onChange(next);
    focusBox(Math.min(next.length, LENGTH - 1));
    if (next.length === LENGTH) onComplete?.(next);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) onChange(value.slice(0, index) + value.slice(index + 1));
      else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    fill(index, event.clipboardData.getData("text"));
  }

  return (
    <div
      role="group"
      aria-label="6-digit code"
      className={cn("flex justify-between gap-2", invalid && "animate-shake")}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={digit}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={LENGTH}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onFocus={(event) => event.target.select()}
          onChange={(event) => fill(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={(event) => onPaste(index, event)}
          className={cn(
            "bg-background h-14 w-full min-w-0 rounded-xl border text-center text-xl font-semibold tabular-nums transition-[border-color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
            invalid ? "border-destructive" : "border-input",
            digit && !invalid && "border-foreground/40",
          )}
        />
      ))}
    </div>
  );
}
