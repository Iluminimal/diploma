import Link from "next/link";
import { MobileNav } from "@/components/mobile-nav";
import { MegaMenu } from "@/components/mega-menu";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/features/auth/account-menu";
import { CartButton } from "@/features/cart/cart-button";

export function SiteHeader() {
  return (
    <header
      // Named so page transitions leave it in place (see globals.css).
      style={{ viewTransitionName: "site-header" }}
      className="header-elevate bg-background/80 border-border sticky top-0 z-40 border-b backdrop-blur-lg"
    >
      <div className="container-page flex h-14 items-center gap-2 md:h-16 md:gap-6">
        <MobileNav />
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Lookalike
        </Link>
        <MegaMenu />
        <SearchBar className="mx-auto hidden w-full max-w-md md:block" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeToggle />
          <AccountMenu />
          <CartButton />
        </div>
      </div>
      <div className="container-page pb-3 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
