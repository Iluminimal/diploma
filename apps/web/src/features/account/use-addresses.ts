"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-store";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  createAddress,
  deleteAddress,
  fetchAddresses,
  updateAddress,
  type AddressChanges,
  type AddressInput,
} from "./addresses-api";

export function useAddresses() {
  const status = useAuth((state) => state.status);
  return useQuery({
    queryKey: queryKeys.addresses,
    queryFn: async () => (await fetchAddresses()).items,
    enabled: status === "signedIn",
  });
}

/** Mutation алдаагаа өөрөө toast-оор мэдээлдэг тул дуудагч зөвхөн амжилтыг боловсруулна. */
function useAddressMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onError: (error) => toast.error(userMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.addresses }),
  });
}

export const useCreateAddress = () => useAddressMutation((body: AddressInput) => createAddress(body));

export const useUpdateAddress = () =>
  useAddressMutation(({ id, changes }: { id: number; changes: AddressChanges }) => updateAddress(id, changes));

export const useDeleteAddress = () => useAddressMutation((id: number) => deleteAddress(id));
