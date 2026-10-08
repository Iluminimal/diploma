"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { ProductGrid, ProductGridSkeleton } from "@/components/product-grid";
import { Button } from "@/components/ui/button";
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
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="bg-muted grid size-14 place-items-center rounded-full">
          <Heart className="text-muted-foreground size-6" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Nothing saved yet</h2>
          <p className="text-muted-foreground text-sm">Tap the heart on any product to keep it here.</p>
        </div>
        <Button asChild size="lg" className="h-11 rounded-xl px-5">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }
  return <ProductGrid products={data.items} columns={3} priorityCount={0} headingLevel={2} />;
}
