"use client";

import { Camera, House, Search, ShoppingBag, UserRound } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserAvatar } from "@/components/layout/user-avatar";
import { useAuth } from "@/features/auth/auth-store";
import { useCartDrawer } from "@/features/cart/cart-ui-store";
import { useCart } from "@/features/cart/use-cart";
import { cn } from "@/lib/utils";
import { useSearchPanel } from "./search-ui-store";
import { showsTabBar } from "./tab-bar-rules";

// The photo picker (and the dialog library behind it) is fetched the first time it is wanted.
const PhotoSearchDialog = dynamic(() => import("@/features/search/photo-search-dialog").then((m) => m.PhotoSearchDialog), {
  ssr: false,
});

const tab =
  "focus-visible:ring-ring/60 relative grid h-12 place-items-center rounded-xl outline-none transition-[color,scale] duration-200 focus-visible:ring-3 active:scale-90";

/**
 * Instagram's bottom bar: five icons and no words. Home, Search, Photo (the camera in the middle,
 * where Instagram has "create"), Cart and You (your own photo). It is the only place on a phone
 * that offers these, so nothing appears twice: the top bar keeps just the logo and the menu.
 * Each icon has a name for screen readers; the current one is drawn with a bolder line.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const user = useAuth((state) => state.user);
  const signedIn = useAuth((state) => state.status === "signedIn");
  const { data: cart } = useCart();
  const cartOpen = useCartDrawer((state) => state.open);
  const setCartOpen = useCartDrawer((state) => state.setOpen);
  const requestSearch = useSearchPanel((state) => state.request);
  const [requested, setRequested] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!showsTabBar(pathname)) return null;

  const home = pathname === "/";
  const you = pathname.startsWith("/account") || pathname === "/login";
  const count = cart?.item_count ?? 0;
  const tone = (active: boolean) => (active ? "text-foreground" : "text-muted-foreground");

  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="bg-background/90 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 px-2">
          <Link href="/" prefetch={false} aria-label="Home" aria-current={home ? "page" : undefined} className={cn(tab, tone(home))}>
            <House aria-hidden className="size-6" strokeWidth={home ? 2.6 : 1.8} />
          </Link>
          <button type="button" aria-label="Search" aria-haspopup="dialog" onClick={requestSearch} className={cn(tab, tone(false))}>
            <Search aria-hidden className="size-6" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Search with a photo"
            aria-haspopup="dialog"
            onClick={() => {
              setRequested(true);
              setPhotoOpen(true);
            }}
            className={cn(tab, tone(false))}
          >
            <Camera aria-hidden className="size-6" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label={count ? `Cart, ${count} items` : "Cart"}
            aria-haspopup="dialog"
            aria-expanded={cartOpen}
            onClick={() => setCartOpen(true)}
            className={cn(tab, tone(cartOpen))}
          >
            <ShoppingBag aria-hidden className="size-6" strokeWidth={cartOpen ? 2.6 : 1.8} />
            {count > 0 && (
              <span
                // Remounts when the count changes, which replays the pop.
                key={count}
                aria-hidden
                className="animate-pop bg-primary text-primary-foreground absolute top-1.5 left-1/2 grid min-w-4.5 translate-x-1 place-items-center rounded-full px-1 text-[0.65rem] leading-4.5 font-semibold tabular-nums"
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
          <Link
            href={signedIn ? "/account/profile" : "/login"}
            prefetch={false}
            aria-label={signedIn && user ? `Account: ${user.full_name}` : "Sign in"}
            aria-current={you ? "page" : undefined}
            className={cn(tab, tone(you))}
          >
            {signedIn && user ? (
              <UserAvatar user={user} size={26} className={cn(you && "ring-foreground ring-2 ring-offset-2 ring-offset-background")} />
            ) : (
              <UserRound aria-hidden className="size-6" strokeWidth={you ? 2.4 : 1.8} />
            )}
          </Link>
        </div>
      </nav>
      {requested && <PhotoSearchDialog open={photoOpen} onOpenChange={setPhotoOpen} />}
    </>
  );
}
