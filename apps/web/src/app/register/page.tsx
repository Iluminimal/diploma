import type { Metadata } from "next";
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
      subtitle="Save your cart, favourites and order history."
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
