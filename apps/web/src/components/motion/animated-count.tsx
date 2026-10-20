"use client";

import { AnimatedNumber } from "./animated-number";

const group = (value: number) => value.toLocaleString("en-US");

/**
 * Мянгатын тусгаарлагчтай бүхэл тоо, шинэ утга руугаа тоолно (үр дүнгийн тоо). Server component
 * client component-д функц дамжуулж чадахгүй тул форматыг дотор нь хийнэ.
 */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  return <AnimatedNumber value={value} format={group} className={className} />;
}
