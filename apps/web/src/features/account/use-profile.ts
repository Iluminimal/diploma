"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-store";
import { browserApi, call } from "@/lib/api/browser";
import { accountKeys } from "@/lib/query-keys";

/** Rename the account. The header and the greeting read the user from the auth store. */
export function useUpdateName() {
  return useMutation({
    mutationFn: (full_name: string) => call(browserApi().PATCH("/api/v1/auth/me", { body: { full_name } })),
    onSuccess: (user) => useAuth.setState({ user }),
  });
}

type PasswordChange = { current_password?: string; new_password: string };

/** Set or change the password. The API ends every other login and hands this browser a new session. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: PasswordChange) => call(browserApi().PUT("/api/v1/auth/password", { body })),
    onSuccess: (session) => useAuth.getState().setSession(session),
  });
}

type Deletion = { confirm: string; password?: string };

/** Delete the account. The API clears the session cookies; here the in-memory state goes too. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Deletion) => call(browserApi().DELETE("/api/v1/auth/me", { body })),
    onSuccess: async () => {
      useAuth.getState().clear();
      for (const queryKey of accountKeys) queryClient.removeQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
}
