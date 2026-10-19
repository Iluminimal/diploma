import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Use it for markup that depends on
 * the browser (its locale data, for instance), so the first client render matches the server's.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
