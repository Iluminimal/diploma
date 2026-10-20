"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Admin дэлгэцийг админаас бусдад хаана. Энэ нь зочинд ойлгомжтой мессеж үзүүлэхийн тулд (хүсэлт
 * алдаа өгөхийн оронд); бодитоор татгалздаг нь API.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status);
  const role = useAuth((state) => state.user?.role);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "signedIn") {
    return (
      <main id="main" tabIndex={-1} className="container-page flex-1 py-10 outline-none">
        <Skeleton aria-busy aria-label="Checking your access" className="h-64 rounded-2xl" />
      </main>
    );
  }
  if (role !== "admin") {
    return (
      <main id="main" tabIndex={-1} className="container-page flex-1 outline-none">
        <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="bg-muted grid size-14 place-items-center rounded-full">
            <ShieldAlert aria-hidden className="text-muted-foreground size-6" />
          </span>
          <div className="space-y-1">
            <h1 className="text-lg font-medium">You don&apos;t have access to this area</h1>
            <p className="text-muted-foreground text-sm">The admin area is for store administrators.</p>
          </div>
          <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-5">
            <Link href="/">Back to the store</Link>
          </Button>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
