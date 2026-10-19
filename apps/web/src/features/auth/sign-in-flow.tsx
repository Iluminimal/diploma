"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, userMessage } from "@/lib/api/errors";
import { useAuth } from "./auth-store";
import { CodeStep } from "./code-step";
import { IdentifierField } from "./identifier-field";
import { looksLikePhone, parseIdentifier, type Identifier } from "./identifier";
import { landingPath } from "./landing";
import { NameStep } from "./name-step";
import { PasswordStep } from "./password-step";
import { regionOfBrowser, typePhone } from "./phone-input";
import { useAuthActions } from "./use-auth-actions";
import { useCountdown } from "./use-countdown";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";
import type { CountryCode } from "libphonenumber-js/min";

const RESEND_SECONDS = 60;
type Step = "identify" | "password" | "code" | "name";

function heading(step: Step, who: Identifier | null): { title: string; subtitle: string } {
  switch (step) {
    case "password":
      return { title: "Enter your password", subtitle: "Or get a one-time code by email instead. That also creates an account if you are new." };
    case "code":
      return { title: "Enter the code", subtitle: `We sent a 6-digit code to ${who?.shown ?? "you"}. New here? It creates your account.` };
    case "name":
      return { title: "Welcome to Angel", subtitle: "Your account is ready. What should we call you?" };
    default:
      return { title: "Sign in or create account", subtitle: "Enter your email or phone number. New here? We'll create your account." };
  }
}

/**
 * Signing in and signing up are one flow, as on apple.com or airbnb.com: one field for an email
 * or a phone number, then the next step for what was typed. A phone number gets a code by text; an
 * email gets a password, or a code by email. A code for somebody new creates their account, and
 * only then is the name asked. No step reveals whether an account exists.
 */
export function SignInFlow({ next, notice, social }: { next: string; notice?: string | null; social?: ReactNode }) {
  const router = useRouter();
  const { requestCode } = useAuthActions();
  const countdown = useCountdown();
  const [step, setStep] = useState<Step>("identify");
  const [text, setText] = useState("");
  const [region, setRegion] = useState<CountryCode>("US");
  const [regionPicked, setRegionPicked] = useState(false);
  const [who, setWho] = useState<Identifier | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  useRedirectWhenSignedIn(next, !naming);

  const phone = looksLikePhone(text);
  const { title, subtitle } = heading(step, who);

  function change(raw: string) {
    setProblem(null);
    if (!looksLikePhone(raw)) return setText(raw);
    // The first digits typed: start from the visitor's own country, unless they already picked one.
    const guess = !phone && !regionPicked ? regionOfBrowser() : undefined;
    const typed = typePhone(raw, guess ?? region);
    setText(typed.text);
    setRegion(typed.region);
  }

  function finish() {
    router.replace(landingPath(next, useAuth.getState().user?.role));
    router.refresh();
  }

  /** Sends a code. Resolves to whether it went out; the reason, if not, is in `problem`. */
  async function sendCode(destination: string) {
    setProblem(null);
    setBusy(true);
    try {
      await requestCode(destination);
      countdown.start(RESEND_SECONDS);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) countdown.start(error.retryAfter);
      setProblem(userMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function identify(event: FormEvent) {
    event.preventDefault();
    const parsed = parseIdentifier(text, region);
    if ("error" in parsed) return setProblem(parsed.error);
    setWho(parsed);
    setProblem(null);
    if (parsed.kind === "email") return setStep("password");
    if (await sendCode(parsed.destination)) setStep("code");
  }

  function edit() {
    setProblem(null);
    setStep("identify");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <h1 id="step-heading" className="type-title">
          {title}
        </h1>
        <p className="text-muted-foreground type-body">{subtitle}</p>
      </header>

      {notice && (
        <p role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      <div key={step} className="animate-in fade-in slide-in-from-right-4 space-y-5 duration-300 motion-reduce:animate-none">
        {(step === "password" || step === "code") && who && (
          <button
            type="button"
            onClick={edit}
            aria-label={`Change ${who.shown}`}
            className="border-field bg-card hover:bg-secondary focus-visible:ring-ring/60 mx-auto flex max-w-full items-center gap-2 rounded-full border py-1.5 pr-3 pl-4 text-sm outline-none transition-colors focus-visible:ring-3"
          >
            <span className="truncate font-medium">{who.shown}</span>
            <span className="text-muted-foreground shrink-0 underline underline-offset-4">Edit</span>
          </button>
        )}

        {step === "identify" && (
          <>
            <form onSubmit={identify} noValidate className="space-y-4" aria-label="Sign in or create account">
              <IdentifierField
                value={text}
                onChange={change}
                phone={phone}
                region={region}
                onRegionChange={(picked) => {
                  setRegionPicked(true);
                  setRegion(picked);
                }}
                error={problem ?? undefined}
              />
              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy && <Loader2 className="animate-spin" />} Continue
              </Button>
            </form>
            {social}
          </>
        )}

        {step === "password" && who?.kind === "email" && (
          <PasswordStep
            email={who.destination}
            onSignedIn={finish}
            codeBusy={busy}
            codeProblem={problem}
            onUseCode={async () => {
              if (await sendCode(who.destination)) setStep("code");
            }}
          />
        )}

        {step === "code" && who && (
          <>
            <CodeStep
              destination={who.destination}
              resendIn={countdown.remaining}
              onResend={() => void sendCode(who.destination)}
              onNaming={() => setNaming(true)}
              onVerified={(isNew) => {
                if (isNew) return setStep("name");
                toast.success("Welcome back.");
                finish();
              }}
            />
            {problem && (
              <p role="alert" className="text-destructive text-center text-sm">
                {problem}
              </p>
            )}
          </>
        )}

        {step === "name" && <NameStep onDone={finish} />}
      </div>
    </div>
  );
}
