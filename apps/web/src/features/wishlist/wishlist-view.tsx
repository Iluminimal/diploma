"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ProductGrid, ProductGridSkeleton } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useWishlist } from "./use-wishlist";
import { QueryError } from "@/components/ui/query-error";

export function WishlistView() {
  const t = useTranslations("account.wishlist");
  const { data, isPending, error, refetch } = useWishlist();

  if (isPending) return <ProductGridSkeleton count={4} />;
  if (error || !data) {
    return (
      <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
    );
  }
  if (data.items.length === 0) {
    return (
      <EmptyState icon={Heart} title={t("empty")} description={t("emptyHint")}>
        <Button asChild size="lg">
          <Link href="/products">{t("browse")}</Link>
        </Button>
      </EmptyState>
    );
  }
  return <ProductGrid products={data.items} columns={3} priorityCount={0} headingLevel={2} />;
}
