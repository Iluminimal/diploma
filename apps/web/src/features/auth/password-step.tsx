"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FloatingLabel, floatingInputClass } from "@/components/forms/floating-label";
import { fieldAria } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { ApiError, userMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useAuthActions } from "./use-auth-actions";

/** An email that has a password: ask for it, or offer a code instead (which also creates an account). */
export function PasswordStep({
  email,
  onSignedIn,
  onUseCode,
  codeBusy,
  codeProblem,
}: {
  email: string;
  onSignedIn: () => void;
  onUseCode: () => void;
  codeBusy: boolean;
  codeProblem: string | null;
}) {
  const { signIn } = useAuthActions();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!password) return setProblem("Enter your password.");
    setProblem(null);
    setBusy(true);
    try {
      await signIn({ email, password });
      onSignedIn();
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.is("invalidCredentials")
          ? // The same words for every email, so this never reveals who has an account, plus the way
            // out for people who signed up with Google or a code and have no password yet.
            `${userMessage(error)} No password yet? Get a code by email instead, or use “Continue with Google”.`
          : userMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = problem ?? codeProblem ?? undefined;
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Sign in">
      {/* Lets password managers see which account this is. */}
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
          <FloatingLabel htmlFor="password">Password</FloatingLabel>
        </div>
        {shown && (
          <p id="password-error" role="alert" className="text-destructive animate-in fade-in slide-in-from-top-1 text-sm duration-300">
            {shown}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <Loader2 className="animate-spin" />} Sign in
      </Button>
      <Button type="button" variant="outline" size="lg" disabled={codeBusy} onClick={onUseCode} className="w-full">
        {codeBusy && <Loader2 className="animate-spin" />} Email me a code instead
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
