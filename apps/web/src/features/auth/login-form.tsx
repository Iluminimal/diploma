"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field, fieldAria } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { ApiError, userMessage } from "@/lib/api/errors";
import { useAuthActions } from "./use-auth-actions";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const [formError, setFormError] = useState<string | null>(null);
  useRedirectWhenSignedIn(next);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values);
      router.replace(next);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.is("invalidCredentials")
          ? // The same words for every email (so this never reveals who has an account), plus the way out for people who signed up with Google.
            `${userMessage(error)} Signed up with Google? Use “Continue with Google” instead.`
          : userMessage(error),
      );
    }
  });

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        noValidate
        className="space-y-4"
        aria-label="Sign in"
      >
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            className="h-11 rounded-xl"
            {...fieldAria("email", errors.email?.message)}
            {...register("email")}
          />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            autoComplete="current-password"
            className="h-11 rounded-xl"
            {...fieldAria("password", errors.password?.message)}
            {...register("password")}
          />
        </Field>
        {formError && (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-xl px-3 py-2.5 text-sm"
          >
            {formError}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-11 w-full rounded-full text-sm"
        >
          {isSubmitting && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        New here?{" "}
        <Link
          href={
            next === "/"
              ? "/register"
              : `/register?next=${encodeURIComponent(next)}`
          }
          className="text-foreground font-medium underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
