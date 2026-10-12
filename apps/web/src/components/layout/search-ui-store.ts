import { create } from "zustand";

/**
 * Lets something other than the header's magnifier open the search panel (the phone tab bar's
 * Search tab). Each `request()` is one ask; the panel opens when the count changes.
 */
export const useSearchPanel = create<{ requests: number; request: () => void }>((set) => ({
  requests: 0,
  request: () => set((state) => ({ requests: state.requests + 1 })),
}));
