import { Skeleton } from "@/components/ui/skeleton";

/** Бүтээгдэхүүний хуудас бэлтгэгдэж байх хооронд: зураг зүүн талд, мэдээлэл баруун талд. */
export function ProductSkeleton() {
  return (
    <div className="container-page py-8 md:py-12" aria-busy>
      <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
        <Skeleton className="aspect-[3/4] w-full rounded-[var(--radius-tile)]" />
        <div className="space-y-5">
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-10 w-4/5 rounded-lg" />
          <Skeleton className="h-7 w-28 rounded" />
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
