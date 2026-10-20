"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RatingInput } from "./rating-input";
import type { Review } from "./reviews-api";
import { useCreateReview, useUpdateReview } from "./use-reviews";

const schema = z.object({
  rating: z.number({ error: "Choose a rating" }).int().min(1, "Choose a rating").max(5),
  title: z.string().trim().max(120, "Use at most 120 characters"),
  body: z.string().trim().max(2000, "Use at most 2,000 characters"),
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
      toast.success(review ? "Your review is updated." : "Thank you! Your review is up.");
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
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={review ? "Edit your review" : "Write a review"}>
      <RatingInput value={rating} onChange={(next) => setValue("rating", next, { shouldValidate: true })} error={errors.rating?.message} />
      <Field id="review-title" label="Headline (optional)" error={errors.title?.message}>
        <Input {...fieldAria("review-title", errors.title?.message)} maxLength={120} className="h-11 rounded-xl" {...register("title")} />
      </Field>
      <Field id="review-body" label="Your review (optional)" error={errors.body?.message}>
        <Textarea {...fieldAria("review-body", errors.body?.message)} maxLength={2000} rows={4} {...register("body")} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="h-11 rounded-full px-5" disabled={pending}>
          {pending ? "Saving…" : review ? "Save changes" : "Post review"}
        </Button>
        {review && (
          <Button type="button" variant="outline" size="lg" className="h-11 rounded-full px-5" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
