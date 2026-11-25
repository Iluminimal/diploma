import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { AdminGate } from "@/features/admin/admin-gate";
import { AdminShell } from "@/features/admin/admin-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return {
    title: { default: t("admin"), template: `%s · ${t("admin")}` },
    robots: { index: false, follow: false },
  };
}

// Admin сайтын сонгосон хэлээр (өгөгдмөл монгол) гарна; үнэ, орлого нь дэлгүүрийн валютаар (₮).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AdminGate>
        <AdminShell>{children}</AdminShell>
      </AdminGate>
    </NextIntlClientProvider>
  );
}
