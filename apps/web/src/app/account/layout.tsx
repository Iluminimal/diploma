import type { Metadata } from "next";
import { AccountGreeting, AccountNav } from "@/features/account/account-nav";

export const metadata: Metadata = { robots: { index: false } };

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <div className="container-page py-8 md:py-12">
      <header className="mb-8 space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tighter md:text-4xl">Your account</h1>
        <AccountGreeting />
      </header>
      <div className="space-y-8">
        <AccountNav />
        {children}
      </div>
    </div>
  );
}
