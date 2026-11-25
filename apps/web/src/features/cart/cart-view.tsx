"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/product/price";
import { Button } from "@/components/ui/button";
import { CartLines, UndoBar } from "./cart-lines";
import { FreeShippingProgress } from "./free-shipping-progress";
import { useCart } from "./use-cart";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";

export function CartView() {
  const t = useTranslations("cart");
  const { data: cart, isPending, error, refetch } = useCart();

  if (isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" aria-busy aria-label={t("loading")}>
        <div className="space-y-4">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-32 rounded-[var(--radius-tile)]" />
          ))}
        </div>
        <Skeleton className="hidden h-56 rounded-[var(--radius-tile)] lg:block" />
      </div>
    );
  }
  if (error || !cart) {
    return (
      <QueryError error={error} onRetry={refetch} retryLabel={t("tryAgain")} />
    );
  }
  if (cart.lines.length === 0) {
    return (
      // Ачаалах skeleton-той ижил өндөр (8rem-ийн 3 мөр ба зайнууд), ингэснээр доорх хуудас
      // үсрэхгүй.
      <div>
        <EmptyState
          icon={ShoppingBag}
          as="p"
          title={t("empty")}
          description={t("emptyBrowse")}
          className="min-h-[26rem] py-16"
        >
          <Button asChild size="lg">
            <Link href="/products">{t("shopAll")}</Link>
          </Button>
          <Button asChild variant="bordered" size="lg">
            <Link href="/search">{t("searchByPhoto")}</Link>
          </Button>
        </EmptyState>
        <div className="mx-auto max-w-sm empty:hidden">
          <UndoBar />
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
      <CartLines cart={cart} />
      <aside
        aria-label={t("orderSummary")}
        className="tile space-y-4 p-6 lg:sticky lg:top-20"
      >
        <h2 className="type-heading">{t("summary")}</h2>
        <FreeShippingProgress subtotalCents={cart.subtotal_cents} />
        <dl className="type-body space-y-2">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("subtotalItems", { count: cart.item_count })}</dt>
            <dd>
              <Price cents={cart.subtotal_cents} currency={cart.currency} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("shipping")}</dt>
            <dd className="text-muted-foreground">{t("calculatedAtCheckout")}</dd>
          </div>
        </dl>
        <div className="border-border flex items-baseline justify-between border-t pt-4">
          <span className="type-heading">{t("estimatedTotal")}</span>
          <Price cents={cart.subtotal_cents} currency={cart.currency} className="type-heading" />
        </div>
        {cart.has_issues && (
          <p role="status" className="text-destructive type-caption">
            {t("needsAttention")}
          </p>
        )}
        {cart.has_issues ? (
          <Button size="xl" className="w-full" disabled>
            {t("checkout")} <ArrowRight />
          </Button>
        ) : (
          <Button asChild size="xl" className="w-full">
            <Link href="/checkout">
              {t("checkout")} <ArrowRight />
            </Link>
          </Button>
        )}
      </aside>
    </div>
  );
}
