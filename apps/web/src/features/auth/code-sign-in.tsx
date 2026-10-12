"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateName } from "@/features/account/use-profile";
import { ApiError, userMessage } from "@/lib/api/errors";
import { useAuth } from "./auth-store";
import { landingPath } from "./landing";
import { OtpInput } from "./otp-input";
import { PhoneInput, toE164, type PhoneValue } from "./phone-input";
import { useAuthActions } from "./use-auth-actions";
import { useCountdown } from "./use-countdown";

const RESEND_SECONDS = 60;
type Step = "destination" | "code" | "name";

/**
 * Sign in or sign up with a one-time code sent to a phone number or an email: ask where to send
 * it, take the six digits, and (only for a brand-new account) ask what to call the customer.
 */
export function CodeSignIn({
  kind,
  next,
  onNaming,
}: {
  kind: "phone" | "email";
  next: string;
  /** Called before the session is stored for a new account, so the page does not redirect yet. */
  onNaming?: (naming: boolean) => void;
}) {
  const router = useRouter();
  const { requestCode, signInWithCode } = useAuthActions();
  const rename = useUpdateName();
  const countdown = useCountdown();
  const [step, setStep] = useState<Step>("destination");
  const [phone, setPhone] = useState<PhoneValue>({ text: "", region: "US" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const destination = kind === "phone" ? toE164(phone.text, phone.region) : email.trim().toLowerCase();
  const shown = kind === "phone" ? (destination ?? phone.text) : email.trim();

  function finish() {
    router.replace(landingPath(next, useAuth.getState().user?.role));
    router.refresh();
  }

  async function send(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    setProblem(null);
    if (kind === "phone" ? !destination : !/^\S+@\S+\.\S+$/.test(destination ?? "")) {
      setProblem(kind === "phone" ? "Enter a valid phone number." : "Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await requestCode(destination!);
      countdown.start(RESEND_SECONDS);
      setCode("");
      setStep("code");
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) countdown.start(error.retryAfter);
      setProblem(userMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function verify(entered: string) {
    if (busy || !destination) return;
    setProblem(null);
    setBusy(true);
    try {
      const isNew = await signInWithCode({ destination, code: entered }, () => onNaming?.(true));
      if (isNew) setStep("name");
      else {
        toast.success("Welcome back.");
        finish();
      }
    } catch (error) {
      setProblem(userMessage(error));
      setShake((count) => count + 1);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function saveName(event: { preventDefault: () => void }) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return finish();
    try {
      await rename.mutateAsync(trimmed);
      toast.success(`Welcome, ${trimmed}.`);
      finish();
    } catch (error) {
      setProblem(userMessage(error));
    }
  }

  if (step === "name") {
    return (
      <form onSubmit={saveName} noValidate className="space-y-4" aria-label="Your name">
        <p className="text-sm">Your account is ready. What should we call you?</p>
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
        <button type="button" onClick={finish} className="text-muted-foreground mx-auto block text-sm underline underline-offset-4">
          Skip for now
        </button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <div className="space-y-4" aria-label="Enter your code">
        <p className="text-sm" id="code-sent">
          We sent a 6-digit code to <span className="font-medium">{shown}</span>.
        </p>
        <div key={shake}>
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={verify}
            invalid={Boolean(problem)}
            disabled={busy}
            autoFocus
            describedBy="code-sent"
          />
        </div>
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          disabled={busy || code.length < 6}
          onClick={() => verify(code)}
          className="w-full"
        >
          {busy && <Loader2 className="animate-spin" />} Continue
        </Button>
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("destination");
              setProblem(null);
            }}
            className="underline underline-offset-4"
          >
            Use a different {kind === "phone" ? "number" : "email"}
          </button>
          <button
            type="button"
            disabled={countdown.remaining > 0 || busy}
            onClick={() => send()}
            className="underline underline-offset-4 disabled:no-underline disabled:opacity-60"
          >
            {countdown.remaining > 0 ? `Resend in ${countdown.remaining}s` : "Resend code"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={send}
      noValidate
      className="space-y-4"
      aria-label={kind === "phone" ? "Sign in with your phone" : "Sign in with an email code"}
    >
      {kind === "phone" ? (
        <Field id="phone" label="Phone number" error={problem ?? undefined} hint="We'll text you a code. New here? This creates your account.">
          <PhoneInput id="phone" value={phone} onChange={setPhone} invalid={Boolean(problem)} autoFocus />
        </Field>
      ) : (
        <Field id="code-email" label="Email" error={problem ?? undefined} hint="We'll email you a code. New here? This creates your account.">
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-xl"
            {...fieldAria("code-email", problem ?? undefined, "hint")}
          />
        </Field>
      )}
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <Loader2 className="animate-spin" />} Send code
      </Button>
    </form>
  );
}
