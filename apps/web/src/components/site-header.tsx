import { Camera } from "lucide-react";
import Link from "next/link";
import { MobileNav } from "@/components/mobile-nav";
import { NAV_LINKS } from "@/components/nav-links";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="bg-background/80 border-border sticky top-0 z-40 border-b backdrop-blur-lg">
      <div className="container-page flex h-14 items-center gap-2 md:h-16 md:gap-6">
        <MobileNav />
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Lookalike
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <SearchBar className="mx-auto hidden w-full max-w-md md:block" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Button asChild variant="ghost" size="icon" aria-label="Search by photo">
            <Link href="/search">
              <Camera />
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
      <div className="container-page pb-3 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
