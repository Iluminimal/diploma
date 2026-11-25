import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { oauthErrorMessage } from "@/features/auth/oauth-errors";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignInFlow } from "@/features/auth/sign-in-flow";
import { parseMode } from "@/features/auth/auth-mode";
import { safeNext } from "@/features/auth/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.flow");
  return { title: t("identifyTitle"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [params, t] = await Promise.all([searchParams, getTranslations("auth")]);
  const next = safeNext(params.next);
  return (
    <AuthShell>
      <SignInFlow next={next} initialMode={parseMode(params.mode)} notice={oauthErrorMessage(params.error, t)} social={<GoogleSignIn next={next} />} />
    </AuthShell>
  );
}
