import { create } from "zustand";

/** The line that was just added (shown highlighted in the Bag), identified by product and size. */
export type AddedLine = { productId: number; size: string };

/** The last line taken out of the cart, so it can be put back. */
export type RemovedLine = { productId: number; size: string; quantity: number; name: string };

type CartUi = {
  open: boolean;
  setOpen: (open: boolean) => void;
  added: AddedLine | null;
  setAdded: (line: AddedLine | null) => void;
  removed: RemovedLine | null;
  setRemoved: (line: RemovedLine | null) => void;
};

/** Whether the Bag panel is open, so "Add to cart" can show it from anywhere. */
export const useBagPanel = create<CartUi>((set) => ({
  open: false,
  setOpen: (open) => set(open ? { open } : { open, added: null }),
  added: null,
  setAdded: (added) => set({ added }),
  removed: null,
  setRemoved: (removed) => set({ removed }),
}));
