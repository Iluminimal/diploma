import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Хажууд нь `FloatingLabel` байгаа input-ийн class-ууд: текстийн дээр label-д зай үлдээнэ. */
export const floatingInputClass =
  "border-field bg-card focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-14 w-full rounded-xl border px-4 pt-5 pb-1 text-[1.0625rem] transition-[border-color,box-shadow,padding] duration-200 outline-none focus-visible:ring-3 aria-invalid:ring-3";

/**
 * Талбарын label нь apple.com, google.com шиг: хоосон талбар дотор placeholder мэт байж, focus авах
 * эсвэл текст орох үед дээд ирмэг рүү хөвнө. `<input placeholder=" ">`-тэй нэг `group relative`
 * хайрцагт тавина (хоосон placeholder нь CSS-д талбар хоосон гэдгийг мэдэгддэг).
 */
export function FloatingLabel({ htmlFor, className, children }: { htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "text-muted-foreground pointer-events-none absolute top-1/2 left-4 origin-left -translate-y-1/2 text-[1.0625rem] transition-all duration-200 ease-out",
        "group-focus-within:top-3.5 group-focus-within:translate-y-0 group-focus-within:text-xs",
        "group-has-[input:not(:placeholder-shown)]:top-3.5 group-has-[input:not(:placeholder-shown)]:translate-y-0 group-has-[input:not(:placeholder-shown)]:text-xs",
        className,
      )}
    >
      {children}
    </label>
  );
}
