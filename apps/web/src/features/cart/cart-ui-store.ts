import { create } from "zustand";

/** The line that was just added (shown highlighted in the drawer), identified by product and size. */
export type AddedLine = { productId: number; size: string };

type CartUi = {
  open: boolean;
  setOpen: (open: boolean) => void;
  added: AddedLine | null;
  setAdded: (line: AddedLine | null) => void;
};

/** Whether the mini-cart drawer is open, so "Add to cart" can show it from anywhere. */
export const useCartDrawer = create<CartUi>((set) => ({
  open: false,
  setOpen: (open) => set(open ? { open } : { open, added: null }),
  added: null,
  setAdded: (added) => set({ added }),
}));
