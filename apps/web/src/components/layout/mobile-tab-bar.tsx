"use client";

import { Camera, Heart, House, Store, UserRound } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-store";
import { cn } from "@/lib/utils";

// The photo picker (and the dialog library behind it) is fetched the first time it is wanted.
const PhotoSearchDialog = dynamic(() => import("@/features/search/photo-search-dialog").then((m) => m.PhotoSearchDialog), {
  ssr: false,
});

/**
 * Where the bar is not wanted: a product page has its own bar for "Add to cart", checkout and the
 * sign-in pages should not offer ways out. (The admin area has no shop chrome at all.)
 */
export function showsTabBar(pathname: string): boolean {
  if (/^\/products\/\d+/.test(pathname)) return false;
  return !["/checkout", "/login", "/register", "/forgot-password"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

type Tab = "home" | "shop" | "saved" | "account";

function activeTab(pathname: string): Tab | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/products") || pathname.startsWith("/c/")) return "shop";
  if (pathname.startsWith("/account/wishlist")) return "saved";
  if (pathname.startsWith("/account") || pathname === "/login") return "account";
  return null;
}

const item =
  "focus-visible:ring-ring/60 relative z-10 flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-medium outline-none transition-colors duration-300 focus-visible:ring-3";

/**
 * A bar along the bottom of the screen on phones: Home, Shop, a raised Photo button in the middle
 * (the store's reason to exist), Saved and Account. A small dot slides to the section you are in.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const signedIn = useAuth((state) => state.status === "signedIn");
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);
  if (!showsTabBar(pathname)) return null;

  const active = activeTab(pathname);
  const slots: (Tab | "photo")[] = ["home", "shop", "photo", "saved", "account"];
  const tone = (tab: Tab) => (active === tab ? "text-foreground" : "text-muted-foreground");

  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="bg-background/85 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="relative mx-auto grid max-w-md grid-cols-5 px-2">
          {active && (
            <span
              aria-hidden
              className="bg-foreground absolute bottom-1 left-2 h-1 w-[calc((100%-1rem)/5)] origin-center transition-transform duration-500 ease-out-expo"
              style={{ transform: `translateX(${slots.indexOf(active) * 100}%) scaleX(0.18)` }}
            />
          )}
          <Link href="/" aria-current={active === "home" ? "page" : undefined} className={cn(item, tone("home"))}>
            <House aria-hidden className="size-5" /> Home
          </Link>
          <Link href="/products" aria-current={active === "shop" ? "page" : undefined} className={cn(item, tone("shop"))}>
            <Store aria-hidden className="size-5" /> Shop
          </Link>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label="Search with a photo"
            onClick={() => {
              setRequested(true);
              setOpen(true);
            }}
            className="focus-visible:ring-ring/60 relative z-10 flex flex-col items-center justify-center outline-none"
          >
            <span className="bg-primary text-primary-foreground -mt-5 grid size-12 place-items-center rounded-full shadow-lg transition-transform duration-200 active:scale-90">
              <Camera aria-hidden className="size-5" />
            </span>
            <span className="text-muted-foreground mt-0.5 text-[0.6875rem] font-medium">Photo</span>
          </button>
          <Link
            href="/account/wishlist"
            prefetch={false}
            aria-current={active === "saved" ? "page" : undefined}
            className={cn(item, tone("saved"))}
          >
            <Heart aria-hidden className="size-5" /> Saved
          </Link>
          <Link
            href={signedIn ? "/account/profile" : "/login"}
            prefetch={false}
            aria-current={active === "account" ? "page" : undefined}
            className={cn(item, tone("account"))}
          >
            <UserRound aria-hidden className="size-5" /> {signedIn ? "Account" : "Sign in"}
          </Link>
        </div>
      </nav>
      {requested && <PhotoSearchDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
