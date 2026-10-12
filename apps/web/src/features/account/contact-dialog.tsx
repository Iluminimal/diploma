"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, fieldAria } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SessionUser } from "@/features/auth/auth-store";
import { OtpInput } from "@/features/auth/otp-input";
import { PhoneInput, toE164, type PhoneValue } from "@/features/auth/phone-input";
import { useCountdown } from "@/features/auth/use-countdown";
import { ApiError, userMessage } from "@/lib/api/errors";
import {
  useConfirmEmail,
  useConfirmEmailVerification,
  useConfirmPhone,
  useRemoveEmail,
  useRemovePhone,
  useRequestEmail,
  useRequestEmailVerification,
  useRequestPhone,
} from "./use-contact";

export type ContactKind = "phone" | "email" | "verify-email";

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * Add or change the phone number or email, or confirm the email already on the account. Two
 * steps: say where the code should go (and prove the password, if there is one), then type it.
 */
export function ContactDialog({
  kind,
  user,
  open,
  onOpenChange,
}: {
  kind: ContactKind;
  user: SessionUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const verifying = kind === "verify-email";
  const current = kind === "phone" ? user.phone : user.email;
  const noun = kind === "phone" ? "phone number" : "email address";
  const requestPhone = useRequestPhone();
  const confirmPhone = useConfirmPhone();
  const requestEmail = useRequestEmail();
  const confirmEmail = useConfirmEmail();
  const requestVerification = useRequestEmailVerification();
  const confirmVerification = useConfirmEmailVerification();
  const countdown = useCountdown();
  const [step, setStep] = useState<"enter" | "code">(verifying ? "code" : "enter");
  const [phone, setPhone] = useState<PhoneValue>({ text: "", region: "US" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const destination = kind === "phone" ? toE164(phone.text, phone.region) : email.trim().toLowerCase();

  function close(next: boolean) {
    if (!next) {
      setStep(verifying ? "code" : "enter");
      setPhone({ text: "", region: phone.region });
      setEmail("");
      setPassword("");
      setCode("");
      setProblem(null);
    }
    onOpenChange(next);
  }

  // Confirming the current address: the code goes out as soon as the dialog opens.
  useEffect(() => {
    if (!open || !verifying) return;
    let cancelled = false;
    requestVerification
      .mutateAsync()
      .then(() => !cancelled && countdown.start(60))
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.retryAfter) countdown.start(error.retryAfter);
        else setProblem(userMessage(error));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open, verifying]);

  async function send(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    setProblem(null);
    if (kind === "phone" ? !destination : !EMAIL.test(destination ?? "")) {
      setProblem(kind === "phone" ? "Enter a valid phone number." : "Enter a valid email address.");
      return;
    }
    if (user.has_password && !password) {
      setProblem("Enter your password to continue.");
      return;
    }
    setBusy(true);
    try {
      const body = user.has_password ? { current_password: password } : {};
      if (kind === "phone") await requestPhone.mutateAsync({ phone: destination!, ...body });
      else await requestEmail.mutateAsync({ email: destination!, ...body });
      countdown.start(60);
      setCode("");
      setStep("code");
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) countdown.start(error.retryAfter);
      setProblem(
        error instanceof ApiError && error.is("invalidCredentials") ? "That isn't your password." : userMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(entered: string) {
    if (busy) return;
    setProblem(null);
    setBusy(true);
    try {
      if (verifying) await confirmVerification.mutateAsync(entered);
      else if (kind === "phone") await confirmPhone.mutateAsync({ phone: destination!, code: entered });
      else await confirmEmail.mutateAsync({ email: destination!, code: entered });
      toast.success(verifying ? "Email confirmed." : kind === "phone" ? "Phone number saved." : "Email saved.");
      close(false);
    } catch (error) {
      setProblem(userMessage(error));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const title = verifying
    ? "Confirm your email"
    : current
      ? `Change ${noun}`
      : kind === "phone"
        ? "Add a phone number"
        : "Add an email address";
  const shown = verifying ? user.email : kind === "phone" ? (destination ?? phone.text) : email.trim();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "enter"
              ? `We'll send a 6-digit code to the new ${noun} to make sure it's yours.`
              : `We sent a 6-digit code to ${shown}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "enter" ? (
          <form onSubmit={send} noValidate className="space-y-4" aria-label="Where to send the code">
            {kind === "phone" ? (
              <Field id="contact-phone" label="Phone number">
                <PhoneInput id="contact-phone" value={phone} onChange={setPhone} autoFocus />
              </Field>
            ) : (
              <Field id="contact-email" label="Email">
                <Input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 rounded-xl"
                  {...fieldAria("contact-email")}
                />
              </Field>
            )}
            {user.has_password && (
              <Field id="contact-password" label="Your password">
                <PasswordInput
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-xl"
                  {...fieldAria("contact-password")}
                />
              </Field>
            )}
            {problem && (
              <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm">
                {problem}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="rounded-full">
                {busy && <Loader2 className="animate-spin" />} Send code
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <OtpInput value={code} onChange={setCode} onComplete={confirm} invalid={Boolean(problem)} disabled={busy} autoFocus />
            {problem && (
              <p role="alert" className="text-destructive text-sm">
                {problem}
              </p>
            )}
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              {verifying ? (
                <span />
              ) : (
                <button type="button" onClick={() => setStep("enter")} className="underline underline-offset-4">
                  Use a different {kind === "phone" ? "number" : "address"}
                </button>
              )}
              <button
                type="button"
                disabled={countdown.remaining > 0 || busy}
                onClick={() => (verifying ? requestVerification.mutate(undefined, { onSuccess: () => countdown.start(60) }) : void send())}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-60"
              >
                {countdown.remaining > 0 ? `Resend in ${countdown.remaining}s` : "Resend code"}
              </button>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || code.length < 6} onClick={() => void confirm(code)} className="rounded-full">
                {busy && <Loader2 className="animate-spin" />} Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Remove the phone number or the email. The API refuses if it is the only way to sign in. */
export function RemoveContactDialog({
  kind,
  user,
  open,
  onOpenChange,
}: {
  kind: "phone" | "email";
  user: SessionUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const removePhone = useRemovePhone();
  const removeEmail = useRemoveEmail();
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const noun = kind === "phone" ? "phone number" : "email address";
  const pending = removePhone.isPending || removeEmail.isPending;

  function close(next: boolean) {
    if (!next) {
      setPassword("");
      setProblem(null);
    }
    onOpenChange(next);
  }

  async function remove() {
    setProblem(null);
    const body = user.has_password ? { current_password: password } : {};
    try {
      if (kind === "phone") await removePhone.mutateAsync(body);
      else await removeEmail.mutateAsync(body);
      toast.success(kind === "phone" ? "Phone number removed." : "Email removed.");
      close(false);
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.is("invalidCredentials") ? "That isn't your password." : userMessage(error),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove your {noun}?</DialogTitle>
          <DialogDescription>
            You won&apos;t be able to sign in with {kind === "phone" ? user.phone : user.email} any more.
            {kind === "email" && user.has_password ? " Your password is removed with it." : ""}
          </DialogDescription>
        </DialogHeader>
        {user.has_password && (
          <Field id="remove-password" label="Your password">
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-xl"
              {...fieldAria("remove-password")}
            />
          </Field>
        )}
        {problem && (
          <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={pending || (user.has_password && !password)}
            onClick={() => void remove()}
            className="rounded-full"
          >
            {pending && <Loader2 className="animate-spin" />} Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
