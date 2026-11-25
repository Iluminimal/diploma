import { useTranslations } from "next-intl";
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
  const t = useTranslations("home");
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-4 md:mb-8", className)}>
      <h2 className="gh-h2">{title}</h2>
      {href && (
        <Link href={href} className="text-brand shrink-0 pb-1.5 text-sm hover:underline">
          {linkLabel ?? t("seeAll")} →
        </Link>
      )}
    </div>
  );
}
