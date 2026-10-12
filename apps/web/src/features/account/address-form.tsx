"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field, fieldAria, selectClass } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Address, AddressInput } from "./addresses-api";

export const COUNTRIES: [code: string, name: string][] = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["IE", "Ireland"],
  ["IN", "India"],
  ["JP", "Japan"],
];

const required = (what: string) => z.string().trim().min(1, `Enter ${what}`);

const schema = z.object({
  full_name: required("a name").max(120),
  line1: required("an address").max(200),
  line2: z.string().trim().max(200),
  city: required("a city").max(100),
  region: z.string().trim().max(100),
  postal_code: z.string().trim().min(2, "Enter a postal code").max(20),
  country: z.string().length(2, "Choose a country"),
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9+()\-. ]{5,30}$/.test(value), "Enter a valid phone number"),
  is_default: z.boolean(),
});
type Values = z.infer<typeof schema>;

type Props = {
  initial?: Address;
  submitLabel?: string;
  /** Offer "make this my default"; hidden when the first address is saved (it becomes the default). */
  askDefault?: boolean;
  onSubmit: (address: AddressInput) => Promise<unknown>;
  onCancel?: () => void;
};

export function AddressForm({ initial, submitLabel = "Save address", askDefault = true, onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: initial?.full_name ?? "",
      line1: initial?.line1 ?? "",
      line2: initial?.line2 ?? "",
      city: initial?.city ?? "",
      region: initial?.region ?? "",
      postal_code: initial?.postal_code ?? "",
      country: initial?.country ?? "US",
      phone: initial?.phone ?? "",
      is_default: initial?.is_default ?? false,
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        ...values,
        line2: values.line2 || null,
        region: values.region || null,
        phone: values.phone || null,
      });
    } catch {
      // The mutation hook already showed the reason; keep the form so nothing typed is lost.
    }
  });

  const input = "h-11 rounded-xl";
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Address details">
      <Field id="full_name" label="Full name" error={errors.full_name?.message} className="sm:col-span-2">
        <Input autoComplete="name" className={input} {...fieldAria("full_name", errors.full_name?.message)} {...register("full_name")} />
      </Field>
      <Field id="line1" label="Address" error={errors.line1?.message} className="sm:col-span-2">
        <Input autoComplete="address-line1" className={input} {...fieldAria("line1", errors.line1?.message)} {...register("line1")} />
      </Field>
      <Field id="line2" label="Apartment, suite, etc. (optional)" error={errors.line2?.message} className="sm:col-span-2">
        <Input autoComplete="address-line2" className={input} {...fieldAria("line2", errors.line2?.message)} {...register("line2")} />
      </Field>
      <Field id="city" label="City" error={errors.city?.message}>
        <Input autoComplete="address-level2" className={input} {...fieldAria("city", errors.city?.message)} {...register("city")} />
      </Field>
      <Field id="region" label="State / region (optional)" error={errors.region?.message}>
        <Input autoComplete="address-level1" className={input} {...fieldAria("region", errors.region?.message)} {...register("region")} />
      </Field>
      <Field id="postal_code" label="Postal code" error={errors.postal_code?.message}>
        <Input autoComplete="postal-code" className={input} {...fieldAria("postal_code", errors.postal_code?.message)} {...register("postal_code")} />
      </Field>
      <Field id="country" label="Country" error={errors.country?.message}>
        <select autoComplete="country" className={selectClass} {...fieldAria("country", errors.country?.message)} {...register("country")}>
          {COUNTRIES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="phone" label="Phone (optional)" error={errors.phone?.message} className="sm:col-span-2">
        <Input type="tel" autoComplete="tel" inputMode="tel" className={input} {...fieldAria("phone", errors.phone?.message)} {...register("phone")} />
      </Field>
      {askDefault && (
        <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
          <input type="checkbox" className="accent-foreground size-4" {...register("is_default")} />
          Use as my default address
        </label>
      )}
      <div className={cn("flex gap-2 sm:col-span-2")}>
        <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 rounded-full px-5 text-sm">
          {isSubmitting && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="lg" className="h-11 rounded-full px-5 text-sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

type Formattable = Pick<Address, "line1" | "city" | "postal_code" | "country"> & {
  line2?: string | null;
  region?: string | null;
};

export function formatAddress(a: Formattable) {
  return [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(", "), `${a.postal_code}, ${a.country}`]
    .filter(Boolean)
    .join(" · ");
}
