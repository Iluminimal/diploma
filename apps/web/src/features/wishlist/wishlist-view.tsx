"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { ProductGrid, ProductGridSkeleton } from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { userMessage } from "@/lib/api/errors";
import { useWishlist } from "./use-wishlist";

export function WishlistView() {
  const { data, isPending, error, refetch } = useWishlist();

  if (isPending) return <ProductGridSkeleton count={4} />;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {userMessage(error)}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (data.items.length === 0) {
    return (
      <EmptyState icon={Heart} title="Nothing saved yet" description="Tap the heart on any product to keep it here.">
        <Button asChild size="lg" className="h-11 rounded-full px-5">
          <Link href="/products">Browse products</Link>
        </Button>
      </EmptyState>
    );
  }
  return <ProductGrid products={data.items} columns={3} priorityCount={0} headingLevel={2} />;
}
