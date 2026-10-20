import Link from "next/link";
import { AngelLogo } from "@/components/layout/logo";
import { HeaderSearch } from "@/components/layout/header-search";
import { MegaMenu } from "@/components/layout/mega-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AccountMenu } from "@/features/auth/account-menu";
import { CartButton } from "@/features/cart/cart-button";

/**
 * Apple-ийн global bar: нарийн, тунгалаг, 44px өндөр, 1024px өргөн; logo, жижиг холбоосууд, хайлт,
 * bag, account жигд тархсан (`justify-content: space-between`, apple.com шиг). Хуудас scroll хийхэд
 * доор нь hairline гарна. Утсан дээр apple.com-ийнхтэй ижил дөрвөн зүйл: logo, хайлт, bag, цэсний
 * товч.
 */
export function SiteHeader() {
  return (
    <header
      // Нэр өгсөн тул хуудас шилжихэд үлдэнэ (globals.css-ыг үз).
      style={{ viewTransitionName: "site-header" }}
      className="header-elevate bg-background/80 sticky top-0 z-40 border-b border-transparent backdrop-blur-xl backdrop-saturate-150 transition-colors duration-300"
    >
      <div className="container-nav flex h-12 items-center gap-1 md:h-11 md:justify-between md:gap-0">
        <Link href="/" className="phone-bar-item focus-visible:ring-ring/60 mr-auto rounded-md text-[1.0625rem] outline-none transition-opacity focus-visible:ring-3 md:mr-0">
          <AngelLogo showName={false} markClassName="size-7" />
        </Link>
        <MegaMenu />
        {/* Logo, хайлт, bag, цэс: apple.com-ийн утасны bar. Утсан дээр account нь Bag хуудсанд,
           md-ээс дээш bar-д байна. Md-ээс дээш icon-ууд холбоостой адил мөрийн item тул бүгд
           жигд тархана, apple.com-ийн bar шиг. */}
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
