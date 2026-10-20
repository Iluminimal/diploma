import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AngelLogo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AccountMenu } from "@/features/auth/account-menu";
import { AdminNav } from "./admin-nav";

/**
 * Admin дэлгэц бүрийн хүрээ: дэлгүүрийн нэр, хэсгүүдийн sidebar (утсан дээр дээр нь мөр), дэлгүүр
 * рүү буцах холбоос, account цэс. Дэлгүүрийн navigation-ыг санаатайгаар оруулаагүй.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const storeLink = (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm outline-none focus-visible:ring-3"
    >
      <ExternalLink aria-hidden className="size-4" /> View store
    </Link>
  );
  return (
    <div className="bg-secondary/50 flex flex-1 flex-col md:flex-row">
      <aside className="bg-background border-border md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Link
            href="/admin"
            className="focus-visible:ring-ring/60 flex items-baseline gap-2 rounded-md outline-none focus-visible:ring-3"
          >
            <AngelLogo
              markClassName="size-[1.35rem]"
              className="text-[1.0625rem]"
            />
            <span className="text-muted-foreground text-xs font-medium">
              Admin
            </span>
          </Link>
          <div className="flex items-center md:hidden">
            {storeLink}
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
        <AdminNav />
        <div className="border-border mt-auto hidden items-center justify-between gap-1 border-t p-3 md:flex">
          {storeLink}
          <div className="flex items-center">
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </aside>
      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 flex-1 p-4 outline-none md:p-8"
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
