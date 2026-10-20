"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ACCOUNT_LINKS } from "@/features/auth/account-links";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { useSignOut } from "@/features/auth/use-sign-out";

type Thumb = { left: number; width: number };

export function AccountNav() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  // Анхны байрлуулалт шууд хийгдэнэ; дараагийнх (товшсоны дараа) гулсана.
  const [placed, setPlaced] = useState(false);

  // Идэвхтэй tab-ын ард байх pill нь tab хооронд гулсдаг ганц элемент. Холбоосоос өөрөөс нь хэмждэг
  // тул tab-ын өргөн хэд ч байсан таарна.
  useLayoutEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
    if (!active) return setThumb(null);
    setThumb({ left: active.offsetLeft, width: active.offsetWidth });
    const frame = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <nav ref={nav} aria-label="Account" className="relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {thumb && (
        <span
          aria-hidden
          className={cn(
            "bg-foreground absolute top-0 h-10 rounded-full",
            placed && "transition-[left,width] duration-500 ease-out-expo",
          )}
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/60 relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
              current
                ? // Гулсах pill хэмжигдтэл холбоос өөрийн дэвсгэрээ зурна.
                  cn("text-background", !thumb && "bg-foreground")
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountGreeting() {
  const user = useAuth((state) => state.user);
  return (
    <p className="text-muted-foreground text-sm">
      {user ? `Signed in as ${user.full_name} (${user.email ?? user.phone})` : " "}
    </p>
  );
}

/**
 * Зөвхөн утсан дээр гарах товч: компьютер дээрх account dropdown утасны bar-д байхгүй (доод bar-ын
 * сүүлийн tab шууд профайл руу орно).
 */
export function AccountSignOut() {
  const leave = useSignOut();
  const signedIn = useAuth((state) => state.status === "signedIn");
  if (!signedIn) return null;
  return (
    <Button variant="outline" className="h-9 shrink-0 rounded-full px-4 md:hidden" onClick={() => void leave()}>
      <LogOut aria-hidden /> Sign out
    </Button>
  );
}
