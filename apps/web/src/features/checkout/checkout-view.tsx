"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { AddressForm, formatAddress } from "@/features/account/address-form";
import { useAddresses, useCreateAddress } from "@/features/account/use-addresses";
import { useAuth } from "@/features/auth/auth-store";
import { useCart } from "@/features/cart/use-cart";
import { ApiError, userMessage } from "@/lib/api/errors";
import { accountKeys, queryKeys } from "@/lib/query-keys";
import { createCheckout, fetchShippingMethods, payDemoOrder, type ShippingMethodId } from "./checkout-api";
import { shippingCostFor } from "./checkout-math";
import { ChoiceCard } from "./choice-card";
import { cardSchema, DEMO_CARD, PaymentForm, type CardValues } from "./payment-form";
import { Skeleton } from "@/components/ui/skeleton";

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${step}`} className="space-y-4">
      <h2 id={`step-${step}`} className="flex items-center gap-3 text-lg font-semibold">
        <span aria-hidden className="bg-foreground text-background grid size-7 place-items-center rounded-full text-sm">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy aria-label="Loading checkout">
      <div className="space-y-4">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-40 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuth((state) => state.status);
  const cartQuery = useCart();
  const addressesQuery = useAddresses();
  const methodsQuery = useQuery({ queryKey: queryKeys.shippingMethods, queryFn: fetchShippingMethods, staleTime: 600_000 });
  const createAddress = useCreateAddress();

  const [pickedAddress, setPickedAddress] = useState<number | null>(null);
  const [method, setMethod] = useState<ShippingMethodId>("standard");
  const [addingAddress, setAddingAddress] = useState(false);
  // One key per attempt: repeating the request after a dropped connection returns the same order
  // instead of creating a second one. A definite answer (success or refusal) starts a new attempt.
  const attemptKey = useRef(crypto.randomUUID());

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CardValues>({ resolver: zodResolver(cardSchema), defaultValues: DEMO_CARD });

  const addresses = addressesQuery.data ?? [];
  const addressId = pickedAddress ?? addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null;

  const pay = useMutation({
    mutationFn: async () => {
      if (addressId === null) throw new Error("no address");
      const { order, payment } = await createCheckout({ address_id: addressId, shipping_method: method }, attemptKey.current);
      if (order.status === "cancelled") {
        throw new ApiError({ status: 409, title: "Order expired", detail: "That attempt expired. Please try again." });
      }
      if (order.status === "paid") return order;
      if (payment.provider !== "offline") {
        throw new ApiError({
          status: 409,
          title: "Live payments",
          detail: "This demo store only takes demo payments, but the server is set up for live ones.",
        });
      }
      return payDemoOrder(order.number);
    },
    onSuccess: async (order) => {
      attemptKey.current = crypto.randomUUID();
      await Promise.all(accountKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      router.push(`/checkout/confirmation/${order.number}`);
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.status !== 0) attemptKey.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart }); // stock may have changed
    },
  });

  if (status === "unknown" || cartQuery.isPending || addressesQuery.isPending || methodsQuery.isPending) {
    return status === "signedOut" ? null : <CheckoutSkeleton />;
  }
  if (status === "signedOut") {
    return (
      <p>
        <Link className="underline underline-offset-4" href="/login?next=%2Fcheckout">
          Sign in
        </Link>{" "}
        to check out.
      </p>
    );
  }
  const loadError = cartQuery.error ?? addressesQuery.error ?? methodsQuery.error;
  const cart = cartQuery.data;
  const methods = methodsQuery.data;
  if (loadError || !cart || !methods) {
    return (
      <p role="alert" className="text-destructive">
        {userMessage(loadError)}
      </p>
    );
  }
  if (cart.lines.length === 0) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-lg font-medium">Your cart is empty</p>
        <Button asChild size="lg" className="h-11 rounded-full px-5">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  const shipping = shippingCostFor(methods, method, cart.subtotal_cents);
  const total = cart.subtotal_cents + shipping;
  const canPay = addressId !== null && !cart.has_issues && !pay.isPending;
  const showAddressForm = addingAddress || addresses.length === 0;

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
      <div className="space-y-10">
        <Section step={1} title="Delivery address">
          {addresses.length > 0 && (
            <div role="radiogroup" aria-label="Saved addresses" className="grid gap-3">
              {addresses.map((address) => (
                <ChoiceCard
                  key={address.id}
                  name="address"
                  value={String(address.id)}
                  checked={addressId === address.id}
                  onChange={() => setPickedAddress(address.id)}
                  aside={address.is_default ? <span className="text-muted-foreground text-xs">Default</span> : undefined}
                >
                  <span className="block font-medium">{address.full_name}</span>
                  <span className="text-muted-foreground block">{formatAddress(address)}</span>
                </ChoiceCard>
              ))}
            </div>
          )}
          {showAddressForm ? (
            <div className="border-border rounded-2xl border p-4 sm:p-5">
              <AddressForm
                submitLabel="Use this address"
                askDefault={addresses.length > 0}
                onSubmit={async (values) => {
                  const saved = await createAddress.mutateAsync(values);
                  setPickedAddress(saved.id);
                  setAddingAddress(false);
                }}
                onCancel={addresses.length > 0 ? () => setAddingAddress(false) : undefined}
              />
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-10 rounded-full px-4" onClick={() => setAddingAddress(true)}>
              Add a new address
            </Button>
          )}
        </Section>

        <Section step={2} title="Shipping method">
          <div role="radiogroup" aria-label="Shipping method" className="grid gap-3">
            {methods.items.map((option) => {
              const cost = shippingCostFor(methods, option.id, cart.subtotal_cents);
              return (
                <ChoiceCard
                  key={option.id}
                  name="shipping"
                  value={option.id}
                  checked={method === option.id}
                  onChange={() => setMethod(option.id)}
                  aside={cost === 0 ? "Free" : <Price cents={cost} currency={methods.currency} />}
                >
                  <span className="block font-medium">{option.label}</span>
                  <span className="text-muted-foreground block">
                    {option.estimated_days} · {option.description}
                  </span>
                </ChoiceCard>
              );
            })}
          </div>
        </Section>

        <Section step={3} title="Payment">
          <form id="checkout-form" noValidate onSubmit={handleSubmit(() => pay.mutate())}>
            <PaymentForm register={register} errors={errors} />
          </form>
        </Section>
      </div>

      <aside aria-label="Order summary" className="border-border bg-card space-y-5 rounded-2xl border p-5 lg:sticky lg:top-24">
        <h2 className="text-base font-semibold">Order summary</h2>
        <ul className="divide-border divide-y" aria-label="Items">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex gap-3 py-3 first:pt-0">
              <div className="bg-muted aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg">
                <ProductImage product={line.product} sizes="56px" />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-2 font-medium">{line.product.name}</p>
                <p className="text-muted-foreground text-xs">
                  {line.size ? `Size ${line.size} · ` : ""}Qty {line.quantity}
                </p>
                {line.issue && (
                  <p role="status" className="text-destructive text-xs font-medium">
                    {line.issue === "out_of_stock" ? "Sold out" : `Only ${line.max_quantity} left`}
                  </p>
                )}
              </div>
              <Price cents={line.line_total_cents} currency={cart.currency} className="text-sm font-medium" />
            </li>
          ))}
        </ul>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>
              <Price cents={cart.subtotal_cents} currency={cart.currency} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{shipping === 0 ? "Free" : <Price cents={shipping} currency={cart.currency} />}</dd>
          </div>
          <div className="border-border flex justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              <Price cents={total} currency={cart.currency} />
            </dd>
          </div>
        </dl>
        {cart.has_issues && (
          <p role="alert" className="text-destructive text-sm">
            Some items are no longer available.{" "}
            <Link href="/cart" className="font-medium underline underline-offset-2">
              Review your cart
            </Link>
          </p>
        )}
        {pay.error && (
          <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm">
            {userMessage(pay.error)}{" "}
            {pay.error instanceof ApiError && pay.error.is("insufficientStock") && (
              <Link href="/cart" className="font-medium underline underline-offset-2">
                Review your cart
              </Link>
            )}
          </p>
        )}
        <Button type="submit" form="checkout-form" size="lg" disabled={!canPay} className="h-12 w-full rounded-full text-sm">
          {pay.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
          Pay now · <Price cents={total} currency={cart.currency} />
        </Button>
        <p className="text-muted-foreground text-center text-xs">Demo payment, no real charge.</p>
      </aside>
    </div>
  );
}
