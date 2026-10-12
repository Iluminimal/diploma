import type { Metadata } from "next";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { oauthErrorMessage } from "@/features/auth/oauth-errors";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignInTabs } from "@/features/auth/sign-in-tabs";
import { safeNext } from "@/features/auth/safe-next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const problem = oauthErrorMessage(params.error);
  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your phone number or email. New here? We'll create your account."
    >
      {problem && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm"
        >
          {problem}
        </p>
      )}
      <GoogleSignIn next={next} mode="signin" />
      <SignInTabs next={next} initial={params.method === "email" ? "email" : "phone"} />
    </AuthShell>
  );
}
