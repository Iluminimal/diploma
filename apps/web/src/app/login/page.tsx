import type { Metadata } from "next";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { oauthErrorMessage } from "@/features/auth/oauth-errors";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignInFlow } from "@/features/auth/sign-in-flow";
import { safeNext } from "@/features/auth/safe-next";

export const metadata: Metadata = {
  title: "Sign in or create account",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  return (
    <AuthShell>
      <SignInFlow next={next} notice={oauthErrorMessage(params.error)} social={<GoogleSignIn next={next} />} />
    </AuthShell>
  );
}
