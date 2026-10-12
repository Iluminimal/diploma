"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, fieldAria } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, userMessage } from "@/lib/api/errors";
import { OtpInput } from "./otp-input";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { useAuthActions } from "./use-auth-actions";
import { useCountdown } from "./use-countdown";

/** Forgot password: a code goes to the phone or email on the account, then a new password. */
export function ForgotPasswordForm() {
  const router = useRouter();
  const { forgotPassword, resetPassword } = useAuthActions();
  const countdown = useCountdown();
  const [step, setStep] = useState<"ask" | "reset">("ask");
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function ask(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    const typed = destination.trim();
    if (typed.length < 3) {
      setProblem("Enter the email or phone number on your account.");
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await forgotPassword(typed);
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
    if (code.length < 6) return setProblem("Enter the 6-digit code.");
    if (password.length < 10) return setProblem("Use at least 10 characters for the new password.");
    setProblem(null);
    setBusy(true);
    try {
      await resetPassword({ destination: destination.trim(), code, new_password: password });
      toast.success("Your password was changed. You're signed in.");
      router.replace("/");
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
      <form onSubmit={reset} noValidate className="space-y-4" aria-label="Reset password">
        <p className="text-sm" id="reset-sent">
          If an account matches <span className="font-medium">{destination.trim()}</span>, we sent it a 6-digit code.
        </p>
        <OtpInput value={code} onChange={setCode} invalid={Boolean(problem) && code.length < 6} disabled={busy} autoFocus describedBy="reset-sent" />
        <Field id="new-password" label="New password" hint="At least 10 characters.">
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-xl"
            {...fieldAria("new-password", undefined, "hint")}
          />
        </Field>
        <PasswordStrengthMeter password={password} id="new-password-strength" />
        {problem && (
          <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm">
            {problem}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy} className="h-11 w-full rounded-full text-sm">
          {busy && <Loader2 className="animate-spin" />} Change password
        </Button>
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <button type="button" onClick={() => setStep("ask")} className="underline underline-offset-4">
            Use something else
          </button>
          <button
            type="button"
            disabled={countdown.remaining > 0 || busy}
            onClick={() => ask()}
            className="underline underline-offset-4 disabled:no-underline disabled:opacity-60"
          >
            {countdown.remaining > 0 ? `Resend in ${countdown.remaining}s` : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={ask} noValidate className="space-y-4" aria-label="Reset your password">
        <Field id="forgot-destination" label="Email or phone number" error={problem ?? undefined}>
          <Input
            autoComplete="username"
            autoFocus
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="h-11 rounded-xl"
            {...fieldAria("forgot-destination", problem ?? undefined)}
          />
        </Field>
        <Button type="submit" size="lg" disabled={busy} className="h-11 w-full rounded-full text-sm">
          {busy && <Loader2 className="animate-spin" />} Send code
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
