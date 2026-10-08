"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  addCartItem,
  fetchCart,
  removeCartItem,
  updateCartItem,
  type Cart,
  type NewCartItem,
} from "./cart-api";
import { withoutLine, withQuantity } from "./cart-math";

const mutationKey = ["cart", "mutation"] as const;

/** The cart belongs to the user or, for a guest, to the browser: separate cache entries. */
function useCartKey() {
  const userId = useAuth((state) => state.user?.id);
  return [...queryKeys.cart, userId ?? "guest"] as const;
}

export function useCart() {
  const status = useAuth((state) => state.status);
  return useQuery({
    queryKey: useCartKey(),
    queryFn: fetchCart,
    // Until the session is restored a request would be answered with the guest cart.
    enabled: status !== "unknown",
    staleTime: 15_000,
  });
}

/**
 * A cart mutation with an optimistic local change, rolled back with a toast if the server says no.
 * Rapid taps overlap, so the server's answer is only trusted once the last request has finished.
 */
function useCartMutation<Variables>(
  mutationFn: (variables: Variables) => Promise<Cart>,
  optimistic?: (cart: Cart, variables: Variables) => Cart,
) {
  const queryClient = useQueryClient();
  const key = useCartKey();
  const lastOne = () => queryClient.isMutating({ mutationKey }) <= 1;

  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Cart>(key);
      if (previous && optimistic) queryClient.setQueryData(key, optimistic(previous, variables));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(userMessage(error));
    },
    onSuccess: (cart) => {
      if (lastOne()) queryClient.setQueryData(key, cart);
    },
    onSettled: () => {
      if (lastOne()) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useAddToCart() {
  return useCartMutation(addCartItem, (cart, item: NewCartItem) => ({
    ...cart,
    item_count: cart.item_count + (item.quantity ?? 1), // the badge moves at once; lines come from the server
  }));
}

export function useSetQuantity() {
  return useCartMutation(
    ({ itemId, quantity }: { itemId: number; quantity: number }) => updateCartItem(itemId, quantity),
    (cart, { itemId, quantity }) => withQuantity(cart, itemId, quantity),
  );
}

export function useRemoveItem() {
  return useCartMutation((itemId: number) => removeCartItem(itemId), withoutLine);
}
