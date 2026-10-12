import { create } from "zustand";

/** True while a filter or sort change is on its way, so the old grid can be dimmed meanwhile. */
export const useListingPending = create<{ pending: boolean; setPending: (pending: boolean) => void }>((set) => ({
  pending: false,
  setPending: (pending) => set({ pending }),
}));
