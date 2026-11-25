import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Маягт, диалогийн дээд талд гарах нэг мөрийн алдаа (серверийн татгалзал, нэвтрэх алдаа). `role="alert"`
 * тул screen reader шууд уншина. Талбар тус бүрийн алдаа `Field`-д; энэ нь маягтын бүхэлд хамаарах алдаа.
 */
export function FormAlert({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" className={cn("bg-destructive/10 text-destructive-text type-caption rounded-xl px-3 py-2.5", className)} {...props} />;
}
