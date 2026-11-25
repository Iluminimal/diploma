import { ProductGridSkeleton } from "@/components/product/product-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="container-page space-y-8 py-8 md:py-12" aria-busy>
      <Skeleton className="h-10 w-72 rounded-lg" />
      <Skeleton className="h-14 w-full max-w-2xl rounded-2xl" />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
