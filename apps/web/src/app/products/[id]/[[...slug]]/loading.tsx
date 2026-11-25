import { ProductSkeleton } from "@/features/catalog/product-skeleton";

// /products/ доторх loading.tsx-г энэ хуудас өвлөдөг тул (жагсаалтын хэлбэр) тусад нь өөрийнхөө хэлбэрийг заана.
export default function ProductLoading() {
  return <ProductSkeleton />;
}
