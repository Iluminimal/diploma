import type { Metadata } from "next";
import { AdminGate } from "@/features/admin/admin-gate";
import { AdminNav } from "@/features/admin/admin-nav";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="container-page py-8 md:py-12">
      <header className="mb-8 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Admin</h1>
        <p className="text-muted-foreground text-sm">Manage the catalogue and look at orders.</p>
      </header>
      <div className="space-y-8">
        <AdminNav />
        <AdminGate>{children}</AdminGate>
      </div>
    </div>
  );
}
