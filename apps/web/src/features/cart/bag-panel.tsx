"use client";

import { LogIn, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dialog } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import { useBarPanel } from "@/components/layout/bar-panel";
import { HEADER_CELL } from "@/components/layout/header-cell";
import { ACCOUNT_LINKS } from "@/features/auth/account-links";
import { useAuth } from "@/features/auth/auth-store";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { MiniCartSkeleton } from "./mini-cart";

// Самбарын жагсаалт, stepper, mutation-ууд нь хүн нээх үед л татагдана.
const MiniCart = dynamic(() => import("./mini-cart").then((m) => m.MiniCart), {
  ssr: false,
  loading: () => <MiniCartSkeleton />,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** Самбарыг нээсэн товч: хаахад focus түүн рүү буцна. */
  trigger: RefObject<HTMLButtonElement | null>;
};

/**
 * apple.com шиг Bag: том гарчигтай цул хуудас, bar-ын logo-той эгнээтэй бүтээгдэхүүний багана, доор
 * нь профайл холбоосууд (account энд байдаг, утасны цэсэнд биш). md-ээс дээш bar-ын доорх дэлгэцийг
 * бүхлээр нь эзэлж, bar хэвээр ашиглагдана: bag товч дахин хаана, search эсвэл department цэс
 * нээхэд бас хаагдана (modal биш dialog). Утсан дээр бүх дэлгэцийг хучиж, өөрийн bar нь зөвхөн хаах
 * товч, учир нь header-ийн бусад товч алга. Эхний нээлтээр ачаална (`CartButton`-г хар): bag icon
 * харуулахад dialog library хэрэггүй.
 */
export function BagPanel({ open, onOpenChange, count, trigger }: Props) {
  const close = () => onOpenChange(false);
  useBarPanel(open);
  // Bar-ын доор ард байгаа хуудас ба bar ашиглагдсаар байна; утсан дээр бүх дэлгэцийг хучих тул
  // dialog modal болно.
  const wide = useMediaQuery("(min-width: 768px)");
  const signedIn = useAuth((state) => state.status === "signedIn");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={!wide}>
      <Dialog.Portal>
        <Dialog.Content
          className="bag-flyout bg-background fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain outline-none duration-300 max-md:data-closed:animate-out max-md:data-closed:fade-out-0 max-md:data-open:animate-in max-md:data-open:fade-in-0 max-md:data-open:slide-in-from-top-4 md:top-[2.8125rem] md:bottom-auto md:z-30 md:max-h-[calc(100dvh-2.8125rem)] md:bg-[var(--flyout)]"
          // Bar дахь дарилт (department, search, bag товч) тэр хяналтын өөрийн хэрэг.
          onInteractOutside={(event) => {
            if ((event.target as Element).closest("header")) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          {/* Утсан дээр хуудас bar-ыг хучдаг тул өөрийн X-тэй; md-ээс дээш bar байсаар байна. */}
          <div className="container-nav w-full md:hidden">
            <div className="flex h-12 items-center justify-end">
              <Dialog.Close className={HEADER_CELL} aria-label="Close Bag">
                <X className="size-[18px]" strokeWidth={1.25} />
              </Dialog.Close>
            </div>
          </div>
          <div className="container-nav flex w-full flex-1 flex-col pt-6 pb-16 md:pt-10 md:pb-20">
            <div className="flex w-full max-w-2xl flex-1 flex-col">
              <Dialog.Title className={cn("type-display mb-8 md:mb-6 md:text-2xl md:leading-7 md:font-semibold md:tracking-normal", count === 0 && "md:sr-only")}>
                Bag
                {count > 0 && <span className="text-muted-foreground ml-3 font-normal">{count}</span>}
              </Dialog.Title>
              <Dialog.Description className="sr-only">Items you have added, with quantities and subtotal.</Dialog.Description>
              <MiniCart onNavigate={close} />
              <nav aria-label="My profile" className="border-border mt-12 border-t pt-8 md:mt-10 md:border-t-0 md:pt-0">
                <p className="text-muted-foreground mb-3 text-sm">My profile</p>
                <ul className="space-y-1">
                  {signedIn ? (
                    ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => (
                      <li key={href}>
                        <ProfileLink href={href} onClick={close}>
                          <Icon aria-hidden className="text-muted-foreground size-4" /> {label}
                        </ProfileLink>
                      </li>
                    ))
                  ) : (
                    <li>
                      <ProfileLink href="/login" onClick={close}>
                        <LogIn aria-hidden className="text-muted-foreground size-4" /> Sign in
                      </ProfileLink>
                    </li>
                  )}
                </ul>
              </nav>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Профайл жагсаалтын нэг мөр: жижиг icon ба semibold нэр, apple.com-ын Bag-ийн доорх шиг. */
function ProfileLink({ href, onClick, children }: { href: string; onClick: () => void; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      // Нэвтрээгүй зочин account хуудсанд redirect авдаг: prefetch хийвэл тэр хариу нэвтэрсний
      // дараа дахин тоглогдох байсан.
      prefetch={false}
      className="hover:text-brand focus-visible:ring-ring/60 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-lg font-semibold tracking-tight outline-none transition-colors focus-visible:ring-3 md:py-1.5 md:text-xs md:leading-4 md:tracking-normal"
    >
      {children}
    </Link>
  );
}
