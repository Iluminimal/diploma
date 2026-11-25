"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { FloatingLabel, floatingInputClass } from "@/components/forms/floating-label";
import { fieldAria } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import { cn } from "@/lib/utils";
import { useAuthActions } from "./use-auth-actions";

/**
 * Нууц үгтэй имэйл: нууц үг асууна, эсвэл оронд нь код санал болгоно (код нь бүртгэл бас үүсгэнэ).
 */
export function PasswordStep({
  email,
  onSignedIn,
  onUseCode,
  codeBusy,
  codeProblem,
  next = "/",
}: {
  email: string;
  onSignedIn: () => void;
  onUseCode: () => void;
  codeBusy: boolean;
  codeProblem: string | null;
  /** Нэвтэрсний дараа очих газар: нууц үг сэргээх хуудсаар дамжиж мөн хадгалагдана. */
  next?: string;
}) {
  const t = useTranslations("auth.password");
  const userMessage = useUserMessage();
  const { signIn } = useAuthActions();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!password) return setProblem(t("empty"));
    setProblem(null);
    setBusy(true);
    try {
      await signIn({ email, password });
      onSignedIn();
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.is("invalidCredentials")
          ? // Имэйл бүрт ижил үг тул хэнд бүртгэл байгааг ил болгохгүй. Мөн Google эсвэл
            // кодоор бүртгүүлсэн, нууц үггүй хүмүүст гарах замыг өгнө.
            t("noPassword", { error: userMessage(error) })
          : userMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = problem ?? codeProblem ?? undefined;
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={t("signIn")}>
      {/* Password manager аль бүртгэл болохыг таньж чадна. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div className="space-y-2">
        <div className={cn("group relative", shown && "animate-shake")}>
          <PasswordInput
            autoComplete="current-password"
            autoFocus
            placeholder=" "
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(floatingInputClass, "pr-11")}
            {...fieldAria("password", shown)}
          />
          <FloatingLabel htmlFor="password">{t("label")}</FloatingLabel>
        </div>
        {shown && (
          <p id="password-error" role="alert" className="text-destructive animate-in fade-in slide-in-from-top-1 type-caption duration-300">
            {shown}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <Loader2 className="animate-spin" />} {t("signIn")}
      </Button>
      <Button type="button" variant="outline" size="lg" disabled={codeBusy} onClick={onUseCode} className="w-full">
        {codeBusy && <Loader2 className="animate-spin" />} {t("emailCode")}
      </Button>
      <p className="text-center type-caption">
        <Link href={next === "/" ? "/forgot-password" : `/forgot-password?next=${encodeURIComponent(next)}`} className="text-muted-foreground hover:text-foreground underline underline-offset-4">
          {t("forgot")}
        </Link>
      </p>
    </form>
  );
}
