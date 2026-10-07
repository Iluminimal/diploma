"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Wand2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({ text: z.string().trim().max(200, "Keep it under 200 characters") });
type Values = z.infer<typeof schema>;

type Props = {
  /** The refinement currently applied to the results. */
  applied: string;
  onSubmit: (text: string) => void;
};

/** "Like this but in blue": adds words to the photo (hybrid search). Empty text goes back to photo-only. */
export function RefineForm({ applied, onSubmit }: Props) {
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
      aria-label="Refine the search with words"
    >
      <label htmlFor="refine" className="text-sm font-medium">
        Refine with words
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="refine"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="like this but in blue"
            aria-invalid={Boolean(errors.text)}
            aria-describedby={errors.text ? "refine-error" : undefined}
            className="h-10 rounded-xl pr-9"
            {...register("text")}
          />
          {applied && (
            <button
              type="button"
              aria-label="Clear refinement"
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
          <Wand2 /> Refine
        </Button>
      </div>
      {errors.text && (
        <p id="refine-error" role="alert" className="text-destructive text-xs">
          {errors.text.message}
        </p>
      )}
    </form>
  );
}
