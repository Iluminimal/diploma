import Link from "next/link";
import { cn } from "@/lib/utils";

export function SectionHeading({
  title,
  href,
  linkLabel,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-4", className)}>
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
      {href && (
        <Link href={href} className="text-brand hover:underline text-sm underline-offset-4 md:text-base">
          {linkLabel ?? "See all"} <span aria-hidden>›</span>
        </Link>
      )}
    </div>
  );
}
