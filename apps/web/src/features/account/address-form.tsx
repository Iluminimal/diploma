"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Controller, useForm, useWatch } from "react-hook-form";
import "@/lib/zod-jitless";
import { z } from "zod";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useFieldError } from "@/i18n/use-field-error";
import type { Address, AddressInput } from "./addresses-api";
import { CAPITAL, CAPITAL_DISTRICTS, REGIONS, formatLocalPhone, isCapital, localPhoneDigits } from "./mongolia";

// Мессежийн оронд `validation` орчуулгын түлхүүр: `useFieldError` идэвхтэй хэл рүү хөрвүүлнэ.
const required = (key: string) => z.string().trim().min(1, key);

const schema = z
  .object({
    full_name: required("addressName").max(120),
    phone: z.string().trim().refine((value) => localPhoneDigits(value) !== null, "addressPhone"),
    region: z.string().refine((value) => (REGIONS as readonly string[]).includes(value), "addressRegion"),
    city: required("addressDistrict").max(100),
    khoroo: z.string().trim().max(40),
    line1: required("addressLine").max(200),
    line2: z.string().trim().max(200),
    postal_code: z.string().trim().regex(/^(\d{5})?$/, "addressPostal"),
    is_default: z.boolean(),
  })
  .refine((value) => !isCapital(value.region) || (CAPITAL_DISTRICTS as readonly string[]).includes(value.city), {
    path: ["city"],
    message: "addressDistrict",
  });
type Values = z.infer<typeof schema>;

type Props = {
  initial?: Address;
  submitLabel?: string;
  /** "Үндсэн болгох" сонголтыг харуулна; анхны хаяг хадгалахад нуугдана (өөрөө үндсэн болно). */
  askDefault?: boolean;
  onSubmit: (address: AddressInput) => Promise<unknown>;
  onCancel?: () => void;
};

/**
 * Монголын хүргэлтийн хаяг: аймаг/хот → дүүрэг/сум → хороо/баг → гудамж, байр, тоот. Нийслэлд дүүргийг
 * жагсаалтаас сонгоно (хүргэлтийн бүс, үнэ үүнээс хамаарна), аймагт сумыг бичнэ. Утас заавал: хүргэлтийн
 * жолооч холбогдоно.
 */
export function AddressForm({ initial, submitLabel, askDefault = true, onSubmit, onCancel }: Props) {
  const t = useTranslations("account.address");
  const fieldError = useFieldError();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: initial?.full_name ?? "",
      phone: formatLocalPhone(initial?.phone),
      region: initial?.region ?? CAPITAL,
      city: initial?.city ?? "",
      khoroo: initial?.khoroo ?? "",
      line1: initial?.line1 ?? "",
      line2: initial?.line2 ?? "",
      postal_code: initial?.postal_code ?? "",
      is_default: initial?.is_default ?? false,
    },
  });
  const region = useWatch({ control, name: "region" });
  const capital = isCapital(region);

  const submit = handleSubmit(async (values) => {
    const local = localPhoneDigits(values.phone);
    try {
      await onSubmit({
        full_name: values.full_name,
        phone: `+976${local}`,
        region: values.region,
        city: values.city,
        khoroo: values.khoroo || null,
        line1: values.line1,
        line2: values.line2 || null,
        postal_code: values.postal_code,
        country: "MN",
        is_default: values.is_default,
      });
    } catch {
      // Алдааны шалтгааныг mutation hook аль хэдийн харуулсан; бичсэн зүйл алдагдахгүйн тулд
      // form-ыг хэвээр үлдээнэ.
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" aria-label={t("form")}>
      <Field id="full_name" label={t("fullName")} error={fieldError(errors.full_name?.message)}>
        <Input autoComplete="name" {...fieldAria("full_name", fieldError(errors.full_name?.message))} {...register("full_name")} />
      </Field>
      <Field id="phone" label={t("phone")} error={fieldError(errors.phone?.message)} hint={t("phoneHint")}>
        <div className="relative">
          <span aria-hidden className="text-muted-foreground type-body pointer-events-none absolute inset-y-0 left-4 flex items-center">
            +976
          </span>
          <Input
            type="tel"
            autoComplete="tel-national"
            inputMode="numeric"
            placeholder="9911 2233"
            className="pl-16"
            {...fieldAria("phone", fieldError(errors.phone?.message), t("phoneHint"))}
            {...register("phone")}
          />
        </div>
      </Field>
      <Field id="region" label={t("region")} error={fieldError(errors.region?.message)}>
        <NativeSelect
          autoComplete="address-level1"
          {...fieldAria("region", fieldError(errors.region?.message))}
          {...register("region", {
            // Аймаг солигдоход өмнөх дүүрэг/сум хүчингүй болно.
            onChange: () => setValue("city", "", { shouldValidate: false }),
          })}
        >
          {REGIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="city" label={capital ? t("district") : t("sum")} error={fieldError(errors.city?.message)}>
        {capital ? (
          <NativeSelect autoComplete="address-level2" {...fieldAria("city", fieldError(errors.city?.message))} {...register("city")}>
            <option value="">{t("districtPlaceholder")}</option>
            {CAPITAL_DISTRICTS.map((name) => (
              <option key={name} value={name}>
                {t("districtName", { name })}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input autoComplete="address-level2" {...fieldAria("city", fieldError(errors.city?.message))} {...register("city")} />
        )}
      </Field>
      <Field id="khoroo" label={capital ? t("khoroo") : t("bag")} error={fieldError(errors.khoroo?.message)}>
        <Input placeholder={capital ? t("khorooPlaceholder") : t("bagPlaceholder")} {...fieldAria("khoroo", fieldError(errors.khoroo?.message))} {...register("khoroo")} />
      </Field>
      <Field id="postal_code" label={t("postalCode")} error={fieldError(errors.postal_code?.message)}>
        <Input autoComplete="postal-code" inputMode="numeric" placeholder="14200" {...fieldAria("postal_code", fieldError(errors.postal_code?.message))} {...register("postal_code")} />
      </Field>
      <Field id="line1" label={t("line1")} error={fieldError(errors.line1?.message)} className="sm:col-span-2">
        <Input autoComplete="address-line1" placeholder={t("line1Placeholder")} {...fieldAria("line1", fieldError(errors.line1?.message))} {...register("line1")} />
      </Field>
      <Field id="line2" label={t("line2")} error={fieldError(errors.line2?.message)} className="sm:col-span-2">
        <Input autoComplete="address-line2" placeholder={t("line2Placeholder")} {...fieldAria("line2", fieldError(errors.line2?.message))} {...register("line2")} />
      </Field>
      {askDefault && (
        <Controller
          control={control}
          name="is_default"
          render={({ field }) => (
            <label className="type-caption flex items-center gap-2.5 sm:col-span-2">
              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} ref={field.ref} />
              {t("makeDefault")}
            </label>
          )}
        />
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} {submitLabel ?? t("save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

type Formattable = Pick<Address, "line1" | "city"> & {
  line2?: string | null;
  region?: string | null;
  khoroo?: string | null;
  postal_code?: string | null;
};

/**
 * Монголын дарааллаар, том нэгжээс жижиг рүү: "Улаанбаатар, Баянгол, 3-р хороо, Энхтайваны өргөн
 * чөлөө 12 · 45 тоот".
 */
export function formatAddress(a: Formattable) {
  const area = [a.region, a.city, a.khoroo].filter(Boolean).join(", ");
  return [area, a.line1, a.line2, a.postal_code].filter(Boolean).join(" · ");
}
