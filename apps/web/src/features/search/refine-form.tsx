"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import "@/lib/zod-jitless";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFieldError } from "@/i18n/use-field-error";

const schema = z.object({ text: z.string().trim().max(200, "max200") });
type Values = z.infer<typeof schema>;

type Props = {
  /** Үр дүнд одоо хэрэглэгдэж буй нарийсгалт. */
  applied: string;
  onSubmit: (text: string) => void;
};

/**
 * "Like this but in blue": зурагт үг нэмнэ (hybrid search). Хоосон текст зөвхөн зургийн хайлт руу
 * буцна.
 */
export function RefineForm({ applied, onSubmit }: Props) {
  const t = useTranslations("search.refine");
  const fieldError = useFieldError();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), values: { text: applied } });

  return (
    <form
      onSubmit={handleSubmit(({ text }) => onSubmit(text))}
      className="space-y-2"
      aria-label={t("label")}
    >
      <label htmlFor="refine" className="type-caption font-medium">
        {t("heading")}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="refine"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t("placeholder")}
            aria-invalid={Boolean(errors.text)}
            aria-describedby={errors.text ? "refine-error" : undefined}
            className="h-10 rounded-xl pr-9"
            {...register("text")}
          />
          {applied && (
            <button
              type="button"
              aria-label={t("clear")}
              onClick={() => {
                reset({ text: "" });
                onSubmit("");
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" size="lg" className="h-10 px-4">
          <Wand2 /> {t("submit")}
        </Button>
      </div>
      {errors.text && (
        <p id="refine-error" role="alert" className="text-destructive type-fine">
          {fieldError(errors.text.message)}
        </p>
      )}
    </form>
  );
}
