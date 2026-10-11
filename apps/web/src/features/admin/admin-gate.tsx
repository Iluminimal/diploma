"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-store";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Keeps the admin screens away from everyone but administrators. This is for the visitor's
 * benefit (a clear message instead of failing requests): the API is what actually refuses.
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
    return <Skeleton aria-busy aria-label="Checking your access" className="h-64 rounded-2xl" />;
  }
  if (role !== "admin") {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="bg-muted grid size-14 place-items-center rounded-full">
          <ShieldAlert aria-hidden className="text-muted-foreground size-6" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-medium">You don&apos;t have access to this area</h2>
          <p className="text-muted-foreground text-sm">The admin area is for store administrators.</p>
        </div>
        <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-5">
          <Link href="/">Back to the store</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
