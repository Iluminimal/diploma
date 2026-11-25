"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { Panel } from "@/components/admin/panel";
import { Field, fieldAria } from "@/components/forms/form-field";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useFieldError } from "@/i18n/use-field-error";
import { useVocab } from "@/i18n/use-vocab";
import type { AdminCategory, AdminProduct } from "./admin-api";
import {
  GENDERS,
  SEASONS,
  imageProblem,
  productSchema,
  toFormValues,
  toPayload,
  type ProductFormValues,
  type ProductPayload,
} from "./product-values";

type Props = {
  categories: AdminCategory[];
  /** Засах үед л байна; шинэ бүтээгдэхүүнд зураг заавал хэрэгтэй. */
  product?: AdminProduct;
  submitLabel: string;
  onSubmit: (payload: ProductPayload, photo: File | null) => Promise<unknown>;
  /** Админ барааг зөвхөн харна: талбарууд идэвхгүй, хадгалах товч байхгүй. */
  readOnly?: boolean;
};


/** Ангиллыг "Apparel › Topwear" хэлбэрээр бүлэглэнэ, дэлгүүрийн шүүлтүүрийн үүрлэлттэй адил. */
function groupCategories(categories: AdminCategory[], name: (value: string) => string) {
  const groups = new Map<string, AdminCategory[]>();
  for (const category of categories) {
    const label = `${name(category.master_category)} › ${name(category.sub_category)}`;
    groups.set(label, [...(groups.get(label) ?? []), category]);
  }
  return [...groups];
}

export function ProductForm({ categories, product, submitLabel, onSubmit, readOnly = false }: Props) {
  const t = useTranslations("admin.productForm");
  const fieldError = useFieldError();
  const vocab = useVocab();
  const creating = product === undefined;
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: toFormValues(product),
  });
  // Бараа өөр газраас (нөөц, идэвхжүүлэлт) өөрчлөгдвөл form-ын хүрээгүй талбарууд шинэчлэгдэнэ, харин
  // хэрэглэгчийн бичиж байгаа зүйл устахгүй (form-ыг дахин mount хийхгүй).
  useEffect(() => {
    if (product) reset(toFormValues(product), { keepDirtyValues: true });
  }, [product, reset]);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [photoError, setPhotoError] = useState<string>();
  const previewUrl = useRef<string>(null);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const problem = imageProblem(file);
    setPhotoError(problem ?? undefined);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = problem ? null : URL.createObjectURL(file);
    setPhoto(problem || !previewUrl.current ? null : { file, url: previewUrl.current });
  };

  const missingPhoto = () => {
    if (!creating || photo) return false;
    setPhotoError("adminPhotoRequired");
    return true;
  };
  const submit = handleSubmit(
    async (values) => {
      if (missingPhoto()) return;
      try {
        await onSubmit(toPayload(values), photo?.file ?? null);
      } catch {
        // Алдааны шалтгааныг mutation hook аль хэдийн харуулсан; бичсэн зүйл алдагдахгүйн тулд
        // form-ыг хэвээр үлдээнэ.
      }
    },
    // Бүх алдааг нэг дор харуулна (зураггүй байгааг оруулаад), оролдлого бүрд нэгээр нь биш.
    () => void missingPhoto(),
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4 md:space-y-6" aria-label={t("label")}>
      <fieldset disabled={readOnly} className="contents">
      {creating && (
        <Panel id="photo-section" title={t("sectionPhoto")}>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-start">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- локал blob preview, optimize хийх зүйлгүй
              <img src={photo.url} alt={t("preview")} className="bg-muted h-40 w-32 rounded-2xl object-cover" />
            ) : (
              <div className="bg-muted text-muted-foreground flex h-40 w-32 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center text-xs">
                <ImagePlus aria-hidden className="size-6" /> {t("noPhoto")}
              </div>
            )}
            <Field id="photo" label={t("photo")} error={fieldError(photoError)} hint={t("photoHint")}>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="h-11 rounded-xl py-2"
                onChange={choosePhoto}
                {...fieldAria("photo", photoError, "Photo hint")}
              />
            </Field>
          </div>
        </Panel>
      )}

      <Panel id="basics-section" title={t("sectionBasics")}>
        <div className="grid gap-4">
          <Field id="name" label={t("name")} error={fieldError(errors.name?.message)}>
            <Input {...fieldAria("name", errors.name?.message)} {...register("name")} />
          </Field>
          <Field id="category_id" label={t("category")} error={fieldError(errors.category_id?.message)}>
            <NativeSelect {...fieldAria("category_id", errors.category_id?.message)} {...register("category_id")}>
              <option value="">{t("selectCategory")}</option>
              {groupCategories(categories, vocab.category).map(([label, items]) => (
                <optgroup key={label} label={label}>
                  {items.map((category) => (
                    <option key={category.id} value={category.id}>
                      {vocab.category(category.article_type)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Panel>

      <Panel id="attributes-section" title={t("sectionAttributes")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="gender" label={t("gender")} error={fieldError(errors.gender?.message)}>
            <NativeSelect {...fieldAria("gender", errors.gender?.message)} {...register("gender")}>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {vocab.gender(gender)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="base_colour" label={t("colour")} error={fieldError(errors.base_colour?.message)}>
            <Input {...fieldAria("base_colour", errors.base_colour?.message)} {...register("base_colour")} />
          </Field>
          <Field id="season" label={t("season")} error={fieldError(errors.season?.message)}>
            <NativeSelect {...fieldAria("season", errors.season?.message)} {...register("season")}>
              <option value="">{t("notSpecified")}</option>
              {SEASONS.map((season) => (
                <option key={season} value={season}>
                  {vocab.season(season)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="usage" label={t("usage")} error={fieldError(errors.usage?.message)}>
            <Input {...fieldAria("usage", errors.usage?.message)} {...register("usage")} />
          </Field>
          <Field id="year" label={t("year")} error={fieldError(errors.year?.message)}>
            <Input inputMode="numeric" {...fieldAria("year", errors.year?.message)} {...register("year")} />
          </Field>
        </div>
      </Panel>

      <Panel id="pricing-section" title={t("sectionPricing")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="price" label={t("price")} error={fieldError(errors.price?.message)} hint={t("priceHint")}>
            <Input inputMode="numeric" {...fieldAria("price", errors.price?.message, "hint")} {...register("price")} />
          </Field>
          <Field id="stock_quantity" label={t("stock")} error={fieldError(errors.stock_quantity?.message)}>
            <Input inputMode="numeric" {...fieldAria("stock_quantity", errors.stock_quantity?.message)} {...register("stock_quantity")} />
          </Field>
        </div>
      </Panel>

      {creating && (
        <Panel id="status-section" title={t("sectionStatus")}>
          <label className="flex items-center gap-2.5 text-sm">
            <Controller control={control} name="is_active" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} ref={field.ref} />} />
            {t("onSale")}
          </label>
        </Panel>
      )}

      </fieldset>

      {!readOnly && (
        <div className="admin-surface sticky bottom-4 z-10 flex justify-end gap-2 p-3 backdrop-blur-xl">
          <Button type="submit" size="lg" disabled={isSubmitting} className="h-10 rounded-full px-6 text-sm">
            {isSubmitting && <Loader2 aria-hidden className="animate-spin" />} {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Засах дэлгэц ашиглана: одоогийн зураг ба солих боломж. */
export function CurrentPhoto({ product }: { product: AdminProduct }) {
  return (
    <Image
      src={product.image.thumb_800}
      alt={product.name}
      width={800}
      height={1067}
      sizes="240px"
      className="bg-muted aspect-[3/4] w-48 rounded-2xl object-cover sm:w-60"
    />
  );
}
