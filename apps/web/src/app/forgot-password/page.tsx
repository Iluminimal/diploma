import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { safeNext } from "@/features/auth/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title"), robots: { index: false } };
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const [params, t] = await Promise.all([searchParams, getTranslations("auth.forgot")]);
  return (
    <AuthShell title={t("title")} subtitle={t("subtitle")}>
      <ForgotPasswordForm next={safeNext(params.next)} />
    </AuthShell>
  );
}
