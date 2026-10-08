"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  createAdminProduct,
  fetchAdminCategories,
  fetchAdminOrder,
  fetchAdminOrders,
  fetchAdminProduct,
  fetchAdminProducts,
  replaceAdminProductImage,
  setAdminProductActive,
  updateAdminProduct,
  type AdminProductChanges,
  type OrderListParams,
  type ProductListParams,
} from "./admin-api";

/** Queries wait for a confirmed administrator, so a customer never even sends the request. */
function useIsAdmin() {
  const status = useAuth((state) => state.status);
  const role = useAuth((state) => state.user?.role);
  return status === "signedIn" && role === "admin";
}

export function useAdminProducts(params: ProductListParams) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: [...queryKeys.admin.products, params],
    queryFn: () => fetchAdminProducts(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useAdminProduct(id: number) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.product(id),
    queryFn: () => fetchAdminProduct(id),
    enabled,
  });
}

export function useAdminCategories() {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.categories,
    queryFn: fetchAdminCategories,
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useAdminOrders(params: OrderListParams) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: [...queryKeys.admin.orders, params],
    queryFn: () => fetchAdminOrders(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useAdminOrder(number: string) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.order(number),
    queryFn: () => fetchAdminOrder(number),
    enabled,
  });
}

/** Mutations report their own failures with a toast, so callers only handle success. */
function useProductMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onError: (error) => toast.error(userMessage(error)),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.products }),
        queryClient.invalidateQueries({ queryKey: ["admin", "product"] }),
      ]),
  });
}

export const useCreateProduct = () => useProductMutation((form: FormData) => createAdminProduct(form));

export const useUpdateProduct = () =>
  useProductMutation(({ id, changes }: { id: number; changes: AdminProductChanges }) =>
    updateAdminProduct(id, changes),
  );

export const useReplaceProductImage = () =>
  useProductMutation(({ id, file }: { id: number; file: File }) => replaceAdminProductImage(id, file));

export const useSetProductActive = () =>
  useProductMutation(({ id, active }: { id: number; active: boolean }) => setAdminProductActive(id, active));
