import { ProductGridSkeleton } from "@/components/product-grid";
import { Skeleton } from "@/components/ui/skeleton";

/** The shape of a listing, shown at once while a category page is being prepared. */
export function ListingSkeleton() {
  return (
    <div className="container-page py-8 md:py-12" aria-busy>
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-5 w-24 rounded" />
      </div>
      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="hidden h-96 rounded-2xl lg:block" />
        <ProductGridSkeleton count={12} columns={3} />
      </div>
    </div>
  );
}
