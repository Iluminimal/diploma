import type { Metadata } from "next";
import { AccountGreeting, AccountNav, AccountSignOut } from "@/features/account/account-nav";

export const metadata: Metadata = { robots: { index: false } };

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <div className="container-page py-8 md:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="type-display">Your account</h1>
          <AccountGreeting />
        </div>
        <AccountSignOut />
      </header>
      <div className="space-y-8">
        <AccountNav />
        {children}
      </div>
    </div>
  );
}
