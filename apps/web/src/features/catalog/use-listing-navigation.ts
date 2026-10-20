"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toHref, type ListingQuery } from "./filters";
import { useListingPending } from "./listing-pending";

/** URL бол цорын ганц үнэний эх: өөрчлөлт бүр хуудас дахин тохируулсан `replace` navigation. */
export function useListingNavigation(query: ListingQuery) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const setPending = useListingPending((state) => state.setPending);
  useEffect(() => {
    setPending(pending);
    return () => setPending(false);
  }, [pending, setPending]);

  function apply(next: ListingQuery) {
    startTransition(() => {
      router.replace(toHref(pathname, { ...next, page: 1 }), { scroll: false });
    });
  }
  return { apply, pending, query };
}
