import { useSyncExternalStore } from "react";

/** Media query таарч байгаа эсэх, шинэчлэгдэж байна. Server дээр болон hydration хийх үед false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
