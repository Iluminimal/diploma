import Link from "next/link";
import { AngelLogo } from "@/components/layout/logo";
import { HeaderSearch } from "@/components/layout/header-search";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AccountMenu } from "@/features/auth/account-menu";
import { CartButton } from "@/features/cart/cart-button";

/**
 * Apple's global bar: slim, translucent, 44px high and 1024px wide, the logo, the small links, search,
 * bag and account spread evenly across it (`justify-content: space-between`, as on apple.com). A hairline appears under it once the page scrolls.
 * On a phone it is the same four things as apple.com: logo, search, bag and the menu button.
 */
export function SiteHeader() {
  return (
    <header
      // Named so page transitions leave it in place (see globals.css).
      style={{ viewTransitionName: "site-header" }}
      className="header-elevate bg-background/80 sticky top-0 z-40 border-b border-transparent backdrop-blur-xl backdrop-saturate-150 transition-colors duration-300"
    >
      <div className="container-nav flex h-12 items-center gap-1 md:h-11 md:justify-between md:gap-0">
        <Link href="/" className="phone-bar-item focus-visible:ring-ring/60 mr-auto rounded-md text-[1.0625rem] outline-none transition-opacity focus-visible:ring-3 md:mr-0">
          <AngelLogo showName={false} markClassName="size-7" />
        </Link>
        <MegaMenu />
        {/* Logo, search, bag, menu: the phone bar of apple.com. The account is in the Bag page on a phone
            and in the bar from md up. From md up the icons are items of the row like the links, so all of
            it is spread evenly, as apple.com's bar is. */}
        <div className="flex items-center md:contents">
          <HeaderSearch />
          <CartButton />
          <span className="hidden md:inline-flex">
            <AccountMenu />
          </span>
        </div>
        <MobileNav />
      </div>
    </header>
  );
}
