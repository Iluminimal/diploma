"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import "@/lib/zod-jitless";
import { z } from "zod";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFieldError } from "@/i18n/use-field-error";
import { RatingInput } from "./rating-input";
import type { Review } from "./reviews-api";
import { useCreateReview, useUpdateReview } from "./use-reviews";

const schema = z.object({
  rating: z.number({ error: "ratingRequired" }).int().min(1, "ratingRequired").max(5),
  title: z.string().trim().max(120, "max120"),
  body: z.string().trim().max(2000, "max2000"),
});
type Values = z.infer<typeof schema>;

/** Сэтгэгдэл бичих, эсвэл аль хэдийн бичсэнийг (`review`) засах. */
export function ReviewForm({
  productId,
  review,
  onDone,
}: {
  productId: number;
  review?: Review;
  onDone?: () => void;
}) {
  const t = useTranslations("reviews.form");
  const fieldError = useFieldError();
  const create = useCreateReview(productId);
  const update = useUpdateReview(productId);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { rating: review?.rating ?? 0, title: review?.title ?? "", body: review?.body ?? "" },
  });
  const rating = useWatch({ control, name: "rating" });
  const pending = create.isPending || update.isPending;

  const submit = handleSubmit((values) => {
    const done = () => {
      toast.success(review ? t("updated") : t("posted"));
      onDone?.();
    };
    if (review) {
      // `null` нь үйлчлүүлэгчийн устгасан гарчиг эсвэл текстийг цэвэрлэнэ.
      update.mutate(
        { id: review.id, changes: { rating: values.rating, title: values.title || null, body: values.body || null } },
        { onSuccess: done },
      );
    } else {
      create.mutate(
        { rating: values.rating, title: values.title || null, body: values.body || null },
        { onSuccess: done },
      );
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={review ? t("editLabel") : t("writeLabel")}>
      <RatingInput value={rating} onChange={(next) => setValue("rating", next, { shouldValidate: true })} error={fieldError(errors.rating?.message)} />
      <Field id="review-title" label={t("headline")} error={fieldError(errors.title?.message)}>
        <Input {...fieldAria("review-title", fieldError(errors.title?.message))} maxLength={120} {...register("title")} />
      </Field>
      <Field id="review-body" label={t("body")} error={fieldError(errors.body?.message)}>
        <Textarea {...fieldAria("review-body", fieldError(errors.body?.message))} maxLength={2000} rows={4} {...register("body")} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("saving") : review ? t("save") : t("post")}
        </Button>
        {review && (
          <Button type="button" variant="outline" size="lg" onClick={onDone}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
