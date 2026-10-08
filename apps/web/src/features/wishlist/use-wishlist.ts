"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import type { Product } from "@/features/catalog/product";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import { fetchWishlist, saveProduct, unsaveProduct, type Wishlist } from "./wishlist-api";

/** Only signed-in shoppers have a wishlist: guests never trigger a request. */
export function useWishlist() {
  const status = useAuth((state) => state.status);
  const userId = useAuth((state) => state.user?.id);
  return useQuery({
    queryKey: [...queryKeys.wishlist, userId],
    queryFn: fetchWishlist,
    enabled: status === "signedIn",
    staleTime: 60_000,
  });
}

export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const userId = useAuth((state) => state.user?.id);
  const key = [...queryKeys.wishlist, userId];

  return useMutation({
    mutationFn: ({ product, saved }: { product: Product; saved: boolean }) =>
      saved ? saveProduct(product.id) : unsaveProduct(product.id),
    onMutate: async ({ product, saved }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Wishlist>(key);
      if (previous) {
        const others = previous.items.filter((item) => item.id !== product.id);
        queryClient.setQueryData<Wishlist>(key, { items: saved ? [product, ...others] : others });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(userMessage(error));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
