"use client";

import { AnimatedNumber } from "./animated-number";

const group = (value: number) => value.toLocaleString("en-US");

/**
 * A whole number with thousands separators that counts to its new value (a result count). It
 * formats inside, because a server component cannot hand a function to a client component.
 */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  return <AnimatedNumber value={value} format={group} className={className} />;
}
