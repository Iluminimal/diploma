"use client";

import { CreditCard, Info } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { Field, fieldAria } from "@/components/form-field";
import { Input } from "@/components/ui/input";

export const cardSchema = z.object({
  card_number: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{13,19}$/, "Enter a card number of 13 to 19 digits")),
  card_name: z.string().trim().min(1, "Enter the name on the card"),
  card_expiry: z.string().trim().regex(/^(0[1-9]|1[0-2])\s?\/\s?\d{2}$/, "Use the format MM/YY"),
  card_cvc: z.string().trim().regex(/^\d{3,4}$/, "Enter the 3 or 4 digit code"),
});
export type CardValues = z.input<typeof cardSchema>;

/** Any values pass: this exists so the flow feels like a real checkout. */
export const DEMO_CARD: CardValues = {
  card_number: "4242 4242 4242 4242",
  card_name: "Demo Shopper",
  card_expiry: "12/34",
  card_cvc: "123",
};

type Props = {
  register: UseFormRegister<CardValues>;
  errors: FieldErrors<CardValues>;
};

export function PaymentForm({ register, errors }: Props) {
  const input = "h-11 rounded-xl";
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Payment details</legend>
      <div role="note" className="bg-muted flex gap-3 rounded-xl p-3.5 text-sm">
        <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Demo payment, no real charge.</strong>{" "}
          <span className="text-muted-foreground">
            Card details stay in your browser and are never sent anywhere. Any values work.
          </span>
        </p>
      </div>
      <Field id="card_number" label="Card number" error={errors.card_number?.message}>
        <div className="relative">
          <CreditCard className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            inputMode="numeric"
            autoComplete="off"
            className={`${input} pl-9`}
            {...fieldAria("card_number", errors.card_number?.message)}
            {...register("card_number")}
          />
        </div>
      </Field>
      <Field id="card_name" label="Name on card" error={errors.card_name?.message}>
        <Input autoComplete="off" className={input} {...fieldAria("card_name", errors.card_name?.message)} {...register("card_name")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="card_expiry" label="Expiry (MM/YY)" error={errors.card_expiry?.message}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="MM/YY"
            className={input}
            {...fieldAria("card_expiry", errors.card_expiry?.message)}
            {...register("card_expiry")}
          />
        </Field>
        <Field id="card_cvc" label="Security code" error={errors.card_cvc?.message}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            className={input}
            {...fieldAria("card_cvc", errors.card_cvc?.message)}
            {...register("card_cvc")}
          />
        </Field>
      </div>
    </fieldset>
  );
}
