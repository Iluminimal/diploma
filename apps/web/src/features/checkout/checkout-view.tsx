"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Price } from "@/components/product/price";
import { ProductImage } from "@/components/product/product-image";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

/** A step of the checkout: its number turns into a check mark once done, and a line to the next step fills. */
function Section({
  step,
  title,
  done = false,
  summary,
  last = false,
  children,
}: {
  step: number;
  title: string;
  done?: boolean;
  /** One line shown beside the title when the step is done ("Ada Lovelace, 12 Analytical Way"). */
  summary?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${step}`} className="relative space-y-4 pl-11">
      <span
        aria-hidden
        className={cn(
          "absolute top-0 left-0 grid size-7 place-items-center rounded-full text-sm transition-colors duration-500",
          done ? "bg-success text-white" : "bg-foreground text-background",
        )}
      >
        {done ? <Check key="done" className="animate-pop size-4" /> : step}
      </span>
      {!last && (
        <span aria-hidden className="bg-border absolute top-9 -bottom-10 left-3.5 w-px">
          <span
            className={cn(
              "bg-success absolute inset-0 origin-top transition-transform duration-700 ease-out-expo",
              done ? "scale-y-100" : "scale-y-0",
            )}
          />
        </span>
      )}
      <h2 className="type-heading flex min-h-7 flex-wrap items-baseline gap-x-3">
        <span id={`step-${step}`}>{title}</span>
        {done && summary && (
          <span className="text-muted-foreground type-caption animate-in fade-in slide-in-from-left-1 min-w-0 truncate font-normal duration-500">
            {summary}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

/** Resolves after `ms`, or at once when the shopper asked for less motion. */
function minimumWait(ms: number): Promise<void> {
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/** Covers the page while the payment goes through; announced to screen readers as a status. */
function ProcessingOverlay() {
  return (
    <div className="bg-background/75 animate-in fade-in fixed inset-0 z-50 grid place-items-center backdrop-blur-xl duration-300">
      <div role="status" className="animate-in zoom-in-95 fade-in flex flex-col items-center gap-4 text-center duration-500">
        <span className="relative grid size-14 place-items-center">
          <span aria-hidden className="border-border absolute inset-0 rounded-full border-2" />
          <Loader2 aria-hidden className="size-14 animate-spin stroke-[1.5]" />
          <Lock aria-hidden className="absolute size-4" />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-semibold">Processing your payment…</p>
          <p className="text-muted-foreground text-sm">Please don&apos;t close this page.</p>
        </div>
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy aria-label="Loading checkout">
      <div className="space-y-4">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-40 rounded-[var(--radius-tile)]" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[var(--radius-tile)]" />
    </div>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuth((state) => state.status);
  // Accounts made with a phone number have no email: the order updates need one.
  const hasEmail = useAuth((state) => Boolean(state.user?.email));
  const [contactEmail, setContactEmail] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
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
    control,
    formState: { errors },
  } = useForm<CardValues>({ resolver: zodResolver(cardSchema), defaultValues: DEMO_CARD });

  const addresses = addressesQuery.data ?? [];
  const addressId = pickedAddress ?? addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null;

  const pay = useMutation({
    mutationFn: async () => {
      if (addressId === null) throw new Error("no address");
      const { order, payment } = await createCheckout(
        {
          address_id: addressId,
          shipping_method: method,
          ...(hasEmail ? {} : { contact_email: contactEmail.trim() }),
        },
        attemptKey.current,
      );
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
      // The overlay is on screen for at least a moment, so a fast answer does not flash it.
      const [paid] = await Promise.all([payDemoOrder(order.number), minimumWait(900)]);
      return paid;
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
        <p className="text-lg font-medium">Your Bag is empty</p>
        <Button asChild size="lg">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  const shipping = shippingCostFor(methods, method, cart.subtotal_cents);
  const total = cart.subtotal_cents + shipping;
  const canPay = addressId !== null && !cart.has_issues && !pay.isPending;
  const showAddressForm = addingAddress || addresses.length === 0;
  const chosenAddress = addresses.find((address) => address.id === addressId);
  const chosenMethod = methods.items.find((option) => option.id === method);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
      {pay.isPending && <ProcessingOverlay />}
      <div className="space-y-10">
        <Section
          step={1}
          title="Delivery address"
          done={chosenAddress !== undefined && !showAddressForm}
          summary={chosenAddress ? `${chosenAddress.full_name}, ${formatAddress(chosenAddress)}` : undefined}
        >
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
            <div className="tile animate-in fade-in slide-in-from-top-2 p-4 duration-500 sm:p-6">
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
            <Button type="button" variant="bordered" onClick={() => setAddingAddress(true)}>
              Add a new address
            </Button>
          )}
          {!hasEmail && (
            <Field
              id="contact-email"
              label="Email for order updates"
              hint="Your receipt and shipping updates are sent here."
              error={contactError ?? undefined}
            >
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                {...fieldAria("contact-email", contactError ?? undefined, "hint")}
              />
            </Field>
          )}
        </Section>

        <Section
          step={2}
          title="Shipping method"
          done={chosenAddress !== undefined && !showAddressForm}
          summary={chosenMethod ? `${chosenMethod.label}, ${chosenMethod.estimated_days}` : undefined}
        >
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

        <Section step={3} title="Payment" last>
          <form id="checkout-form" noValidate onSubmit={handleSubmit(() => {
              if (!hasEmail && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
                setContactError("Enter a valid email address.");
                return;
              }
              setContactError(null);
              pay.mutate();
            })}>
            <PaymentForm register={register} errors={errors} control={control} />
          </form>
        </Section>
      </div>

      <aside aria-label="Order summary" className="tile space-y-5 p-6 lg:sticky lg:top-20">
        <h2 className="type-heading">Order summary</h2>
        <ul className="divide-border divide-y" aria-label="Items">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex gap-3 py-3 first:pt-0">
              <div className="bg-card aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg dark:bg-white">
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
              Review your Bag
            </Link>
          </p>
        )}
        {pay.error && (
          <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm">
            {userMessage(pay.error)}{" "}
            {pay.error instanceof ApiError && pay.error.is("insufficientStock") && (
              <Link href="/cart" className="font-medium underline underline-offset-2">
                Review your Bag
              </Link>
            )}
          </p>
        )}
        <Button type="submit" form="checkout-form" size="xl" disabled={!canPay} className="w-full">
          {pay.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
          Pay now · <Price cents={total} currency={cart.currency} />
        </Button>
        <p className="text-muted-foreground text-center text-xs">Demo payment, no real charge.</p>
      </aside>
    </div>
  );
}
