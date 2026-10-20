"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  addAdminOrderNote,
  cancelAdminOrder,
  createAdminProduct,
  deliverAdminOrder,
  fetchAdminCategories,
  fetchAdminCustomer,
  fetchAdminCustomers,
  fetchAdminOrder,
  fetchAdminOrders,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchAdminReviews,
  fetchAdminStats,
  refundAdminOrder,
  replaceAdminProductImage,
  setAdminCustomerActive,
  setAdminProductActive,
  setAdminProductStock,
  setAdminReviewPublished,
  shipAdminOrder,
  updateAdminProduct,
  type AdminProductChanges,
  type CustomerListParams,
  type OrderListParams,
  type ProductListParams,
  type RefundDetails,
  type ReviewListParams,
  type ShipDetails,
} from "./admin-api";

/** Query-үүд баталгаажсан админыг хүлээнэ, тиймээс энгийн хэрэглэгч хүсэлт ч илгээхгүй. */
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

/** Mutation алдаагаа өөрөө toast-оор мэдээлдэг тул дуудагч зөвхөн амжилтыг боловсруулна. */
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

export function useAdminStats(days: number) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: queryKeys.admin.stats(days),
    queryFn: () => fetchAdminStats(days),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useAdminCustomers(params: CustomerListParams) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: [...queryKeys.admin.customers, params],
    queryFn: () => fetchAdminCustomers(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useAdminCustomer(id: number) {
  const enabled = useIsAdmin();
  return useQuery({ queryKey: queryKeys.admin.customer(id), queryFn: () => fetchAdminCustomer(id), enabled });
}

export function useAdminReviews(params: ReviewListParams) {
  const enabled = useIsAdmin();
  return useQuery({
    queryKey: [...queryKeys.admin.reviews, params],
    queryFn: () => fetchAdminReviews(params),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/**
 * Дэлгүүрийг өөрчлөх үйлдэл (захиалга илгээх, сэтгэгдэл нуух г.м.). Өөрчлөлт dashboard, жагсаалт,
 * үйлчлүүлэгчийн хуудсанд харагдаж болох тул admin-ы бүх өгөгдлийг дахин татна. Алдааг энд
 * toast-оор мэдээлнэ.
 */
function useShopMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onError: (error) => toast.error(userMessage(error)),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
      ]),
  });
}

type OrderAction<V> = V & { number: string };

export const useShipOrder = () =>
  useShopMutation(({ number, ...details }: OrderAction<ShipDetails>) => shipAdminOrder(number, details));
export const useDeliverOrder = () => useShopMutation((number: string) => deliverAdminOrder(number));
export const useCancelOrder = () =>
  useShopMutation(({ number, reason }: { number: string; reason: string }) => cancelAdminOrder(number, reason));
export const useRefundOrder = () =>
  useShopMutation(({ number, ...details }: OrderAction<RefundDetails>) => refundAdminOrder(number, details));
export const useAddOrderNote = () =>
  useShopMutation(({ number, text }: { number: string; text: string }) => addAdminOrderNote(number, text));
export const useSetStock = () =>
  useShopMutation(({ id, quantity }: { id: number; quantity: number }) => setAdminProductStock(id, quantity));
export const useSetCustomerActive = () =>
  useShopMutation(({ id, active }: { id: number; active: boolean }) => setAdminCustomerActive(id, active));
export const useSetReviewPublished = () =>
  useShopMutation(({ id, published }: { id: number; published: boolean }) => setAdminReviewPublished(id, published));
