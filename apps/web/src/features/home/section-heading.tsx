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
    <div className={cn("mb-6 flex items-baseline justify-between gap-4 md:mb-8", className)}>
      <h2 className="type-title">{title}</h2>
      {href && (
        <Link href={href} className="link-more shrink-0">
          {linkLabel ?? "See all"}
        </Link>
      )}
    </div>
  );
}
