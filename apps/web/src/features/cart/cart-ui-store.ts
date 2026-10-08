import { create } from "zustand";

/** Whether the mini-cart drawer is open, so "Add to cart" can show it from anywhere. */
export const useCartDrawer = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
