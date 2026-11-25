"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/i18n/use-format";
import { useUserMessage } from "@/lib/api/use-user-message";
import { useShippingText } from "./shipping-text";
import "@/lib/zod-jitless";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FlaskConical, Loader2, Lock, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Price } from "@/components/product/price";
import { ProductImage } from "@/components/product/product-image";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressForm, formatAddress } from "@/features/account/address-form";
import { zoneFor } from "@/features/account/mongolia";
import { useAddresses, useCreateAddress } from "@/features/account/use-addresses";
import { useAuth } from "@/features/auth/auth-store";
import { useCart } from "@/features/cart/use-cart";
import { ApiError } from "@/lib/api/errors";
import { accountKeys, queryKeys } from "@/lib/query-keys";
import {
  createCheckout,
  fetchPaymentMethod,
  fetchShippingMethods,
  payDemoOrder,
  type Charge,
  type QPayCheckout,
  type ShippingMethodId,
} from "./checkout-api";
import { shippingCostFor } from "./checkout-math";
import { ChoiceCard } from "./choice-card";
import { QPayPanel } from "./qpay-panel";
import type { Order } from "@/features/orders/orders-api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FormAlert } from "@/components/ui/form-alert";

/**
 * Checkout-ийн нэг алхам: дууссаны дараа дугаар нь check mark болж, дараагийн алхам руу шугам
 * дүүрнэ.
 */
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
  /** Алхам дуусахад гарчгийн хажууд харагдах нэг мөр ("Ada Lovelace, 12 Analytical Way"). */
  summary?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${step}`} className="relative space-y-4 pl-11">
      <span
        aria-hidden
        className={cn(
          "absolute top-0 left-0 grid size-7 place-items-center rounded-full type-caption transition-colors duration-500",
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

function CheckoutSkeleton() {
  const t = useTranslations("checkout");
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-busy aria-label={t("loading")}>
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
  const t = useTranslations("checkout");
  const message = useUserMessage();
  const format = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuth((state) => state.status);
  // Сесс дууссан (cookie-тэй ч refresh татгалзсан): нэвтрэх хуудас руу, буцаж ирэхэд checkout.
  useEffect(() => {
    if (status === "signedOut") router.replace("/login?next=%2Fcheckout");
  }, [status, router]);
  // Утасны дугаараар үүссэн бүртгэлд имэйл байдаггүй: захиалгын мэдээлэлд имэйл хэрэгтэй.
  const hasEmail = useAuth((state) => Boolean(state.user?.email));
  const [contactEmail, setContactEmail] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const cartQuery = useCart();
  const addressesQuery = useAddresses();
  const paymentQuery = useQuery({ queryKey: ["checkout", "payment-method"], queryFn: fetchPaymentMethod, staleTime: 600_000 });
  // QPay: захиалга үүсэж нэхэмжлэх гарсны дараа QR-ын самбарыг харуулна.
  const [awaiting, setAwaiting] = useState<{ number: string; charge: Charge; qpay: QPayCheckout; expiresAt: string | null } | null>(null);
  const createAddress = useCreateAddress();

  const [pickedAddress, setPickedAddress] = useState<number | null>(null);
  const [pickedMethod, setPickedMethod] = useState<ShippingMethodId>("standard");
  const [addingAddress, setAddingAddress] = useState(false);
  // Оролдлого бүрд нэг key: холболт тасарсны дараа хүсэлтийг давтахад хоёр дахь захиалга үүсгэхгүй,
  // ижил захиалгыг буцаана. Тодорхой хариу (амжилт эсвэл татгалзал) шинэ оролдлого эхлүүлнэ.
  const attemptKey = useRef(crypto.randomUUID());

  const addresses = addressesQuery.data ?? [];
  const addressId = pickedAddress ?? addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null;
  const chosenAddress = addresses.find((address) => address.id === addressId);
  // Хүргэлтийн төрөл, үнэ хаягийн бүсээс (Улаанбаатар / орон нутаг) хамаарна.
  const zone = zoneFor(chosenAddress?.region);
  const shippingText = useShippingText(zone);
  const methodsQuery = useQuery({
    queryKey: queryKeys.shippingMethods(zone),
    queryFn: () => fetchShippingMethods(zone),
    staleTime: 600_000,
    placeholderData: keepPreviousData,
  });
  // Хаяг солигдож сонгосон төрөл тэр бүсэд байхгүй болбол (орон нутагт шуурхай) энгийн рүү.
  const method: ShippingMethodId = methodsQuery.data?.items.some((option) => option.id === pickedMethod) ? pickedMethod : "standard";

  type PayResult = { kind: "paid"; order: Order } | { kind: "qpay"; number: string; charge: Charge; qpay: QPayCheckout; expiresAt: string | null };

  async function finish(order: Order) {
    attemptKey.current = crypto.randomUUID();
    await Promise.all(accountKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    router.push(`/checkout/confirmation/${order.number}`);
  }

  const pay = useMutation({
    mutationFn: async (): Promise<PayResult> => {
      if (addressId === null) throw new Error("no address");
      const { order, payment } = await createCheckout(
        {
          address_id: addressId,
          shipping_method: method,
          ...(hasEmail ? {} : { contact_email: contactEmail.trim() }),
        },
        attemptKey.current,
      );
      if (order.status === "paid") return { kind: "paid", order };
      if (payment.provider === "qpay" && payment.qpay && payment.charge) {
        return { kind: "qpay", number: order.number, charge: payment.charge, qpay: payment.qpay, expiresAt: order.expires_at ?? null };
      }
      // Туршилтын горим (offline): карт, мөнгөгүйгээр шууд төлөгдсөн гэж тэмдэглэнэ.
      return { kind: "paid", order: await payDemoOrder(order.number) };
    },
    onSuccess: async (result) => {
      if (result.kind === "qpay") {
        attemptKey.current = crypto.randomUUID();
        setAwaiting(result);
        window.scrollTo({ top: 0 });
        return;
      }
      await finish(result.order);
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.status !== 0) attemptKey.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart }); // нөөц өөрчлөгдсөн байж болно
    },
  });

  if (awaiting) {
    return (
      <QPayPanel
        {...awaiting}
        onPaid={(order) => void finish(order)}
        onCancelled={() => {
          attemptKey.current = crypto.randomUUID();
          setAwaiting(null);
          void Promise.all(accountKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
          router.push("/cart");
        }}
      />
    );
  }
  if (
    status === "unknown" ||
    cartQuery.isPending ||
    addressesQuery.isPending ||
    methodsQuery.isPending ||
    paymentQuery.isPending
  ) {
    return status === "signedOut" ? null : <CheckoutSkeleton />;
  }
  if (status === "signedOut") {
    return (
      <p>
        {t.rich("signInTo", {
          link: (chunks) => (
            <Link className="underline underline-offset-4" href="/login?next=%2Fcheckout">
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }
  const loadError = cartQuery.error ?? addressesQuery.error ?? methodsQuery.error ?? paymentQuery.error;
  const cart = cartQuery.data;
  const methods = methodsQuery.data;
  if (loadError || !cart || !methods) {
    return (
      <p role="alert" className="text-destructive">
        {message(loadError)}
      </p>
    );
  }
  if (cart.lines.length === 0) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="type-intro font-medium">{t("empty")}</p>
        <Button asChild size="lg">
          <Link href="/products">{t("continueShopping")}</Link>
        </Button>
      </div>
    );
  }

  const shipping = shippingCostFor(methods, method, cart.subtotal_cents);
  const total = cart.subtotal_cents + shipping;
  const provider = paymentQuery.data?.provider ?? null;
  const qpay = provider === "qpay";
  const canPay = addressId !== null && !cart.has_issues && !pay.isPending && provider !== null;
  const showAddressForm = addingAddress || addresses.length === 0;
  const chosenMethod = methods.items.find((option) => option.id === method);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
      <div className="space-y-10">
        <Section
          step={1}
          title={t("steps.address")}
          done={chosenAddress !== undefined && !showAddressForm}
          summary={chosenAddress ? `${chosenAddress.full_name}, ${formatAddress(chosenAddress)}` : undefined}
        >
          {addresses.length > 0 && (
            <div role="radiogroup" aria-label={t("savedAddresses")} className="grid gap-3">
              {addresses.map((address) => (
                <ChoiceCard
                  key={address.id}
                  name="address"
                  value={String(address.id)}
                  checked={addressId === address.id}
                  onChange={() => setPickedAddress(address.id)}
                  aside={address.is_default ? <span className="text-muted-foreground type-fine">{t("default")}</span> : undefined}
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
                submitLabel={t("useThisAddress")}
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
              {t("addNewAddress")}
            </Button>
          )}
          {!hasEmail && (
            <Field
              id="contact-email"
              label={t("emailLabel")}
              hint={t("emailHint")}
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
          title={t("steps.shippingMethod")}
          done={chosenAddress !== undefined && !showAddressForm}
          summary={chosenMethod ? t("shippingSummary", { label: shippingText.label(chosenMethod), days: shippingText.days(chosenMethod) }) : undefined}
        >
          <div role="radiogroup" aria-label={t("steps.shippingMethod")} className="grid gap-3">
            {methods.items.map((option) => {
              const cost = shippingCostFor(methods, option.id, cart.subtotal_cents);
              return (
                <ChoiceCard
                  key={option.id}
                  name="shipping"
                  value={option.id}
                  checked={method === option.id}
                  onChange={() => setPickedMethod(option.id)}
                  aside={cost === 0 ? t("free") : <Price cents={cost} currency={methods.currency} />}
                >
                  <span className="block font-medium">{shippingText.label(option)}</span>
                  <span className="text-muted-foreground block">
                    {t("shippingMeta", { days: shippingText.days(option), description: shippingText.description(option) })}
                  </span>
                </ChoiceCard>
              );
            })}
          </div>
        </Section>

        <Section step={3} title={t("steps.payment")} last>
          <form
            id="checkout-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!hasEmail && !z.email().safeParse(contactEmail.trim()).success) {
                setContactError(t("emailInvalid"));
                return;
              }
              setContactError(null);
              pay.mutate();
            }}
          >
            {qpay ? (
              <div className="tile flex gap-4 p-4 sm:p-6">
                <QrCode aria-hidden className="mt-0.5 size-6 shrink-0" />
                <div className="space-y-1 type-caption">
                  <p className="font-medium">{t("qpay.method")}</p>
                  <p className="text-muted-foreground">{t("qpay.methodHint")}</p>
                </div>
              </div>
            ) : provider === "offline" ? (
              <div className="tile flex gap-4 p-4 sm:p-6">
                <FlaskConical aria-hidden className="mt-0.5 size-6 shrink-0" />
                <div className="space-y-1 type-caption">
                  <p className="font-medium">{t("offline.title")}</p>
                  <p className="text-muted-foreground">{t("offline.body")}</p>
                </div>
              </div>
            ) : (
              <p role="alert" className="text-destructive type-caption">
                {t("qpay.unavailable")}
              </p>
            )}
          </form>
        </Section>
      </div>

      <aside aria-label={t("orderSummary")} className="tile space-y-5 p-6 lg:sticky lg:top-20">
        <h2 className="type-heading">{t("orderSummary")}</h2>
        <ul className="divide-border divide-y" aria-label={t("items")}>
          {cart.lines.map((line) => (
            <li key={line.id} className="flex gap-3 py-3 first:pt-0">
              <div className="bg-card aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg dark:bg-white">
                <ProductImage product={line.product} sizes="56px" />
              </div>
              <div className="min-w-0 flex-1 type-caption">
                <p className="line-clamp-2 font-medium">{line.product.name}</p>
                <p className="text-muted-foreground type-fine">
                  {line.size ? t("lineMetaSize", { size: line.size, quantity: line.quantity }) : t("lineMeta", { quantity: line.quantity })}
                </p>
                {line.issue && (
                  <p role="status" className="text-destructive type-fine font-medium">
                    {line.issue === "out_of_stock" ? t("soldOut") : t("onlyLeft", { count: line.max_quantity })}
                  </p>
                )}
              </div>
              <Price cents={line.line_total_cents} currency={cart.currency} className="type-caption font-medium" />
            </li>
          ))}
        </ul>
        <dl className="space-y-2 type-caption">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("subtotal")}</dt>
            <dd>
              <Price cents={cart.subtotal_cents} currency={cart.currency} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("shippingLabel")}</dt>
            <dd>{shipping === 0 ? t("free") : <Price cents={shipping} currency={cart.currency} />}</dd>
          </div>
          <div className="border-border flex justify-between border-t pt-3 type-body font-semibold">
            <dt>{t("total")}</dt>
            <dd>
              <Price cents={total} currency={cart.currency} />
            </dd>
          </div>
        </dl>
        {cart.has_issues && (
          <p role="alert" className="text-destructive type-caption">
            {t("unavailable")}{" "}
            <Link href="/cart" className="font-medium underline underline-offset-2">
              {t("reviewBag")}
            </Link>
          </p>
        )}
        {pay.error && (
          <FormAlert>
            {message(pay.error)}{" "}
            {pay.error instanceof ApiError && pay.error.is("insufficientStock") && (
              <Link href="/cart" className="font-medium underline underline-offset-2">
                {t("reviewBag")}
              </Link>
            )}
          </FormAlert>
        )}
        <Button type="submit" form="checkout-form" size="xl" disabled={!canPay} className="w-full">
          {pay.isPending ? <Loader2 className="animate-spin" /> : <Lock />}
          {t("payNow", { amount: format.price(total, cart.currency) })}
        </Button>
        <p className="text-muted-foreground text-center type-fine">{qpay ? t("qpay.note") : t("demoNote")}</p>
      </aside>
    </div>
  );
}
