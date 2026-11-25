"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, fieldAria } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/errors";
import { useUserMessage } from "@/lib/api/use-user-message";
import { parseIdentifier } from "./identifier";
import { OtpInput } from "./otp-input";
import { DEFAULT_REGION } from "./phone-input";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { useAuthActions } from "./use-auth-actions";
import { useCountdown } from "./use-countdown";
import { FormAlert } from "@/components/ui/form-alert";

/** Нууц үг мартсан: бүртгэлийн утас эсвэл имэйл рүү код очиж, дараа нь шинэ нууц үг оруулна. */
export function ForgotPasswordForm({ next = "/" }: { next?: string }) {
  const t = useTranslations("auth.forgot");
  const ta = useTranslations("auth");
  const userMessage = useUserMessage();
  const router = useRouter();
  const { forgotPassword, resetPassword } = useAuthActions();
  const countdown = useCountdown();
  const [step, setStep] = useState<"ask" | "reset">("ask");
  const [destination, setDestination] = useState("");
  // API-д илгээсэн хэлбэр (E.164 эсвэл жижиг үсэгтэй имэйл): код авсан хаягтайгаа ижил байх ёстой.
  const [normalized, setNormalized] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function ask(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    // Нэвтрэхтэй ижил дүрэм: утас E.164 (8 оронтой дугаар Монголоор), имэйл жижиг үсгээр.
    const parsed = parseIdentifier(destination, DEFAULT_REGION, ta);
    if ("error" in parsed) {
      setProblem(parsed.error);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await forgotPassword(parsed.destination);
      setNormalized(parsed.destination);
      countdown.start(60);
      setStep("reset");
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) countdown.start(error.retryAfter);
      setProblem(userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (code.length < 6) return setProblem(t("enterCode"));
    if (password.length < 10) return setProblem(t("tooShort"));
    setProblem(null);
    setBusy(true);
    try {
      await resetPassword({ destination: normalized, code, new_password: password });
      toast.success(t("changed"));
      router.replace(next);
      router.refresh();
    } catch (error) {
      setProblem(userMessage(error));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (step === "reset") {
    return (
      <form onSubmit={reset} noValidate className="space-y-4" aria-label={t("resetLabel")}>
        <p className="type-caption" id="reset-sent">
          {t.rich("sent", {
            destination: destination.trim(),
            b: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        <OtpInput value={code} onChange={setCode} invalid={Boolean(problem) && code.length < 6} disabled={busy} autoFocus describedBy="reset-sent" />
        <Field id="new-password" label={t("newPassword")} hint={t("newPasswordHint")}>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            {...fieldAria("new-password", undefined, "hint")}
          />
        </Field>
        <PasswordStrengthMeter password={password} id="new-password-strength" />
        {problem && (
          <FormAlert>
            {problem}
          </FormAlert>
        )}
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy && <Loader2 className="animate-spin" />} {t("change")}
        </Button>
        <div className="text-muted-foreground flex items-center justify-between type-caption">
          <button type="button" onClick={() => setStep("ask")} className="underline underline-offset-4">
            {t("useElse")}
          </button>
          <button
            type="button"
            disabled={countdown.remaining > 0 || busy}
            onClick={() => ask()}
            className="underline underline-offset-4 disabled:no-underline disabled:opacity-60"
          >
            {countdown.remaining > 0 ? t("resendIn", { seconds: countdown.remaining }) : t("resend")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={ask} noValidate className="space-y-4" aria-label={t("title")}>
        <Field id="forgot-destination" label={t("destination")} error={problem ?? undefined}>
          <Input
            autoComplete="username"
            autoFocus
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            {...fieldAria("forgot-destination", problem ?? undefined)}
          />
        </Field>
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy && <Loader2 className="animate-spin" />} {t("send")}
        </Button>
      </form>
      <p className="text-muted-foreground text-center type-caption">
        <Link href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} className="text-foreground font-medium underline underline-offset-4">
          {t("back")}
        </Link>
      </p>
    </div>
  );
}
