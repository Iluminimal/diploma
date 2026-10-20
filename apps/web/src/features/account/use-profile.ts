"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-store";
import { browserApi, call } from "@/lib/api/browser";
import { accountKeys } from "@/lib/query-keys";

/** Бүртгэлийн нэрийг солино. Header, мэндчилгээ хэрэглэгчийг auth store-оос уншдаг. */
export function useUpdateName() {
  return useMutation({
    mutationFn: (full_name: string) => call(browserApi().PATCH("/api/v1/auth/me", { body: { full_name } })),
    onSuccess: (user) => useAuth.setState({ user }),
  });
}

type PasswordChange = { current_password?: string; new_password: string };

/**
 * Нууц үгийг тохируулах эсвэл солих. API бусад бүх нэвтрэлтийг дуусгаж, энэ browser-т шинэ session
 * өгнө.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: PasswordChange) => call(browserApi().PUT("/api/v1/auth/password", { body })),
    onSuccess: (session) => useAuth.getState().setSession(session),
  });
}

type Deletion = { confirm: string; password?: string };

/** Бүртгэлийг устгана. API session cookie-г цэвэрлэнэ; энд санах ойн state бас арилна. */
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
