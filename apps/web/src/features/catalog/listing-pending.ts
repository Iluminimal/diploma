import { create } from "zustand";

/** Шүүлтүүр эсвэл эрэмбэ солигдож байх үед true, ингэснээр хуучин grid-ийг түр бүдгэрүүлнэ. */
export const useListingPending = create<{ pending: boolean; setPending: (pending: boolean) => void }>((set) => ({
  pending: false,
  setPending: (pending) => set({ pending }),
}));
