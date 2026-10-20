import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * "Энд одоохондоо юу ч алга": зөөлөн дугуй доторх icon, гарчиг, нэг мөр тусламж ба цааш явах зам.
 * Богино өргөгдөж бүдэг байдлаас гарч, хоосон сагс, wishlist нь цоорхой биш төлөв мэт харагдана.
 * `as` нь гарчгийн элемент: хуудас өөрийн heading-гүй бол heading, бусад үед догол мөр.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  as: Title = "h2",
  bordered = false,
  className,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  as?: "h2" | "h3" | "p";
  /** Хуудас доторх "үр дүн алга"-д зориулсан тасархай хүрээ. */
  bordered?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 flex flex-col items-center justify-center gap-4 px-6 py-14 text-center duration-500 ease-out-expo",
        bordered && "tile py-20",
        className,
      )}
    >
      <span className="bg-background grid size-14 place-items-center rounded-full">
        <Icon aria-hidden className="text-muted-foreground size-6" />
      </span>
      <div className="space-y-1">
        <Title className="type-heading">{title}</Title>
        {description && <p className="text-muted-foreground type-body">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
