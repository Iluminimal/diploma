import type { Metadata } from "next";
import { GoogleSignIn } from "@/features/auth/google-sign-in";
import { AuthShell } from "@/features/auth/auth-shell";
import { RegisterForm } from "@/features/auth/register-form";
import { safeNext } from "@/features/auth/safe-next";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false },
};

export default async function RegisterPage({
  searchParams,
}: PageProps<"/register">) {
  const next = safeNext((await searchParams).next);
  return (
    <AuthShell
      title="Create an account"
      subtitle="Save your Bag, favourites and order history."
    >
      <GoogleSignIn next={next} mode="signup" />
      <RegisterForm next={next} />
    </AuthShell>
  );
}
