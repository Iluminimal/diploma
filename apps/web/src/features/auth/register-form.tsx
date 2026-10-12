"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field, fieldAria } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/forms/password-input";
import { PasswordStrengthMeter } from "./password-strength-meter";
import { ApiError, userMessage } from "@/lib/api/errors";
import { useAuthActions } from "./use-auth-actions";
import { useAuth } from "./auth-store";
import { landingPath } from "./landing";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";

const schema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(120, "Keep it under 120 characters"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128, "Use at most 128 characters"),
});
type Values = z.infer<typeof schema>;

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const { register: createAccount } = useAuthActions();
  const [formError, setFormError] = useState<string | null>(null);
  useRedirectWhenSignedIn(next);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });
  const typedPassword = useWatch({ control, name: "password" });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createAccount(values);
      toast.success("Welcome! Your account is ready.");
      router.replace(landingPath(next, useAuth.getState().user?.role));
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.is("emailTaken")) {
        setError("email", { message: userMessage(error) });
      } else {
        setFormError(userMessage(error));
      }
    }
  });

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        noValidate
        className="space-y-4"
        aria-label="Create an account"
      >
        <Field
          id="full_name"
          label="Full name"
          error={errors.full_name?.message}
        >
          <Input
            autoComplete="name"
            className="h-11 rounded-xl"
            {...fieldAria("full_name", errors.full_name?.message)}
            {...register("full_name")}
          />
        </Field>
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
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          hint="At least 10 characters."
        >
          <PasswordInput
            autoComplete="new-password"
            className="h-11 rounded-xl"
            {...fieldAria(
              "password",
              errors.password?.message,
              "At least 10 characters.",
            )}
            {...register("password")}
          />
        </Field>
        <PasswordStrengthMeter password={typedPassword ?? ""} id="password-strength" />
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
          {isSubmitting && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        Prefer your phone number?{" "}
        <Link
          href={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
          className="text-foreground font-medium underline underline-offset-4"
        >
          Sign up with a code
        </Link>
        .
      </p>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link
          href={
            next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`
          }
          className="text-foreground font-medium underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
