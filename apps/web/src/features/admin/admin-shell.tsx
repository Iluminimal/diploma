"use client";

import { ExternalLink, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { AngelLogo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AccountMenu } from "@/features/auth/account-menu";
import { useAuth } from "@/features/auth/auth-store";
import { staffHome } from "@/features/auth/roles";
import { AdminNav, type NavBadges } from "./admin-nav";
import { CommandPalette, useCommandPaletteHotkeys } from "./command-palette";
import { useNavBadges } from "./use-admin";

/**
 * Admin дэлгэц бүрийн хүрээ (macOS-ийн цонх шиг): blur-тай sidebar, дээд талын blur bar (глобал
 * хайлт ⌘K, дэлгүүр рүү буцах, theme, account), доор нь саарал canvas дээр цагаан самбарууд. Дэлгүүрийн
 * navigation-ыг санаатайгаар оруулаагүй.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.shell");
  const role = useAuth((state) => state.user?.role);
  const home = staffHome(role) ?? "/admin";
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkeys(
    useCallback(() => setPaletteOpen((open) => !open), []),
    useCallback(() => setPaletteOpen(true), []),
  );

  const badges: NavBadges = useNavBadges();

  return (
    <div className="admin-canvas flex flex-1 flex-col md:flex-row">
      <aside className="bg-background/75 border-[var(--admin-hairline)] backdrop-blur-2xl md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:border-r">
        {/* Зүүн захыг nav-ын иконтой нэг шугамд (24px), бүгдийг босоо төвд (baseline биш) тавина. */}
        <div className="flex h-14 items-center px-[1.625rem] md:px-6">
          <Link
            href={home}
            data-testid="admin-brand"
            className="focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3"
          >
            <AngelLogo markClassName="size-6" className="text-[1.0625rem] leading-none" />
            <span
              className="bg-foreground/[0.06] text-muted-foreground rounded-full px-2 py-0.5 text-[0.6875rem] leading-4 font-medium"
            >
              {t(role === "warehouse" ? "brandWarehouse" : "brand")}
            </span>
          </Link>
        </div>
        <AdminNav badges={badges} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-[color-mix(in_oklch,var(--admin-canvas)_80%,transparent)] sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--admin-hairline)] px-4 backdrop-blur-2xl md:px-8">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("search")}
            title={t("searchHint")}
            className="bg-background/80 text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 text-sm shadow-[0_0_0_1px_var(--admin-hairline)] outline-none focus-visible:ring-3 sm:max-w-md"
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{t("searchHint")}</span>
            <kbd className="bg-muted hidden rounded-md px-1.5 py-0.5 font-sans text-[0.6875rem] font-medium sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm outline-none focus-visible:ring-3"
            >
              <ExternalLink aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t("viewStore")}</span>
              <span className="sr-only sm:hidden">{t("viewStore")}</span>
            </Link>
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
