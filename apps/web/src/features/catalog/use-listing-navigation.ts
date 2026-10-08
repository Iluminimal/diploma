"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toHref, type ListingQuery } from "./filters";

/** URL is the single source of truth: every change is a `replace` navigation with page reset. */
export function useListingNavigation(query: ListingQuery) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(next: ListingQuery) {
    startTransition(() => {
      router.replace(toHref(pathname, { ...next, page: 1 }), { scroll: false });
    });
  }
  return { apply, pending, query };
}
