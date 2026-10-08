import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { safeNext } from "@/features/auth/safe-next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Your cart and saved items follow you."
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
