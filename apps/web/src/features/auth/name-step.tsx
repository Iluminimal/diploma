"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { userMessage } from "@/lib/api/errors";
import { useUpdateName } from "@/features/account/use-profile";
import { toast } from "sonner";

/** Шинэ бүртгэлийн сүүлийн алхам: үйлчлүүлэгчийг юу гэж дуудах. Заавал биш. */
export function NameStep({ onDone }: { onDone: () => void }) {
  const rename = useUpdateName();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function save(event: { preventDefault: () => void }) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return onDone();
    try {
      await rename.mutateAsync(trimmed);
      toast.success(`Welcome, ${trimmed}.`);
      onDone();
    } catch (error) {
      setProblem(userMessage(error));
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4" aria-label="Your name">
      <Field id="code-name" label="Full name" error={problem ?? undefined}>
        <Input
          autoComplete="name"
          autoFocus
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          className="h-11 rounded-xl"
          {...fieldAria("code-name", problem ?? undefined)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={rename.isPending} className="w-full">
        {rename.isPending && <Loader2 className="animate-spin" />} Continue
      </Button>
      <button type="button" onClick={onDone} className="text-muted-foreground hover:text-foreground mx-auto block text-sm underline underline-offset-4">
        Skip for now
      </button>
    </form>
  );
}
