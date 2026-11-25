"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserMessage } from "@/lib/api/use-user-message";
import { useUpdateName } from "@/features/account/use-profile";
import { toast } from "sonner";

/** Шинэ бүртгэлийн сүүлийн алхам: үйлчлүүлэгчийг юу гэж дуудах. Заавал биш. */
export function NameStep({ onDone }: { onDone: () => void }) {
  const t = useTranslations("auth");
  const userMessage = useUserMessage();
  const rename = useUpdateName();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function save(event: { preventDefault: () => void }) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return onDone();
    try {
      await rename.mutateAsync(trimmed);
      toast.success(t("name.welcome", { name: trimmed }));
      onDone();
    } catch (error) {
      setProblem(userMessage(error));
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4" aria-label={t("name.label")}>
      <Field id="code-name" label={t("name.fullName")} error={problem ?? undefined}>
        <Input
          autoComplete="name"
          autoFocus
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          {...fieldAria("code-name", problem ?? undefined)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={rename.isPending} className="w-full">
        {rename.isPending && <Loader2 className="animate-spin" />} {t("flow.continue")}
      </Button>
      <button type="button" onClick={onDone} className="text-muted-foreground hover:text-foreground mx-auto block type-caption underline underline-offset-4">
        {t("name.skip")}
      </button>
    </form>
  );
}
