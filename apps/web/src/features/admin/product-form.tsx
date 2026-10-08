"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { Field, fieldAria, selectClass } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** Present when editing; a new product also needs its photo. */
  product?: AdminProduct;
  submitLabel: string;
  onSubmit: (payload: ProductPayload, photo: File | null) => Promise<unknown>;
};

const input = "h-11 rounded-xl";

/** Categories grouped as "Apparel › Topwear", the way the storefront's filters nest them. */
function groupCategories(categories: AdminCategory[]) {
  const groups = new Map<string, AdminCategory[]>();
  for (const category of categories) {
    const label = `${category.master_category} › ${category.sub_category}`;
    groups.set(label, [...(groups.get(label) ?? []), category]);
  }
  return [...groups];
}

export function ProductForm({ categories, product, submitLabel, onSubmit }: Props) {
  const creating = product === undefined;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: toFormValues(product),
  });
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

  const submit = handleSubmit(async (values) => {
    if (creating && !photo) {
      setPhotoError("Choose a photo of the product.");
      return;
    }
    try {
      await onSubmit(toPayload(values), photo?.file ?? null);
    } catch {
      // The mutation hook already showed the reason; keep the form so nothing typed is lost.
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Product details">
      {creating && (
        <div className="space-y-2 sm:col-span-2">
          <Field
            id="photo"
            label="Photo"
            error={photoError}
            hint="JPEG, PNG or WebP, up to 8 MB. Visual search uses this photo to find the product."
          >
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="h-11 rounded-xl py-2"
              onChange={choosePhoto}
              {...fieldAria("photo", photoError, "Photo hint")}
            />
          </Field>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise
            <img src={photo.url} alt="Preview of the chosen photo" className="bg-muted h-40 w-32 rounded-xl object-cover" />
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <ImagePlus aria-hidden className="size-4" /> No photo chosen yet
            </p>
          )}
        </div>
      )}

      <Field id="name" label="Name" error={errors.name?.message} className="sm:col-span-2">
        <Input className={input} {...fieldAria("name", errors.name?.message)} {...register("name")} />
      </Field>
      <Field id="category_id" label="Category" error={errors.category_id?.message} className="sm:col-span-2">
        <select className={selectClass} {...fieldAria("category_id", errors.category_id?.message)} {...register("category_id")}>
          <option value="">Select a category</option>
          {groupCategories(categories).map(([label, items]) => (
            <optgroup key={label} label={label}>
              {items.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.article_type}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field id="gender" label="Gender" error={errors.gender?.message}>
        <select className={selectClass} {...fieldAria("gender", errors.gender?.message)} {...register("gender")}>
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {gender}
            </option>
          ))}
        </select>
      </Field>
      <Field id="base_colour" label="Colour (optional)" error={errors.base_colour?.message}>
        <Input className={input} {...fieldAria("base_colour", errors.base_colour?.message)} {...register("base_colour")} />
      </Field>
      <Field id="season" label="Season (optional)" error={errors.season?.message}>
        <select className={selectClass} {...fieldAria("season", errors.season?.message)} {...register("season")}>
          <option value="">Not specified</option>
          {SEASONS.map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
        </select>
      </Field>
      <Field id="usage" label="Usage (optional)" error={errors.usage?.message}>
        <Input className={input} {...fieldAria("usage", errors.usage?.message)} {...register("usage")} />
      </Field>
      <Field id="year" label="Year (optional)" error={errors.year?.message}>
        <Input inputMode="numeric" className={input} {...fieldAria("year", errors.year?.message)} {...register("year")} />
      </Field>
      <Field id="price" label="Price (USD)" error={errors.price?.message} hint="For example 49.99">
        <Input inputMode="decimal" className={input} {...fieldAria("price", errors.price?.message, "hint")} {...register("price")} />
      </Field>
      <Field id="stock_quantity" label="Stock" error={errors.stock_quantity?.message}>
        <Input inputMode="numeric" className={input} {...fieldAria("stock_quantity", errors.stock_quantity?.message)} {...register("stock_quantity")} />
      </Field>
      {creating && (
        <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
          <input type="checkbox" className="accent-foreground size-4" {...register("is_active")} />
          On sale as soon as it is created
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 rounded-xl px-5 text-sm">
          {isSubmitting && <Loader2 aria-hidden className="animate-spin" />} {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Used by the edit screen: the current photo with a way to replace it. */
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
