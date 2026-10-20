"use client";

import { useQueryClient } from "@tanstack/react-query";
import { browserApi, call } from "@/lib/api/browser";
import { accountKeys } from "@/lib/query-keys";
import { useAuth } from "./auth-store";
import { endSession } from "./session";

type Credentials = { email: string; password: string };
type Registration = Credentials & { full_name: string };

/**
 * Нэвтрэх / бүртгүүлэх / гарах. Тус бүр бүртгэлийн өгөгдлийг шинэчилнэ, учир нь зочны cart сервер
 * дээр нийлдэг.
 */
export function useAuthActions() {
  const queryClient = useQueryClient();
  const refreshAccountData = () =>
    Promise.all(
      accountKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );

  return {
    async signIn(body: Credentials) {
      const session = await call(
        browserApi().POST("/api/v1/auth/login", { body }),
      );
      useAuth.getState().setSession(session);
      await refreshAccountData();
    },
    /**
     * Утасны дугаар эсвэл имэйл рүү нэг удаагийн код илгээнэ (нэвтрэх, бүртгүүлэх нь нэг алхам).
     */
    async requestCode(destination: string) {
      await call(
        browserApi().POST("/api/v1/auth/otp/request", { body: { destination } }),
      );
    },
    /**
     * Кодоор нэвтэрнэ (эсвэл бүртгүүлнэ). `onNewUser` нь session хадгалахаас өмнө ажиллана,
     * ингэснээр хуудас шууд гарахын оронд эхлээд нэр асууж болно. `is_new_user`-ийг буцаана.
     */
    async signInWithCode(
      body: { destination: string; code: string },
      onNewUser?: () => void,
    ) {
      const session = await call(
        browserApi().POST("/api/v1/auth/otp/verify", { body }),
      );
      if (session.is_new_user) onNewUser?.();
      useAuth.getState().setSession(session);
      await refreshAccountData();
      return session.is_new_user;
    },
    async forgotPassword(destination: string) {
      await call(
        browserApi().POST("/api/v1/auth/password/forgot", { body: { destination } }),
      );
    },
    async resetPassword(body: { destination: string; code: string; new_password: string }) {
      const session = await call(
        browserApi().POST("/api/v1/auth/password/reset", { body }),
      );
      useAuth.getState().setSession(session);
      await refreshAccountData();
    },
    async register(body: Registration) {
      const session = await call(
        browserApi().POST("/api/v1/auth/register", { body }),
      );
      useAuth.getState().setSession(session);
      await refreshAccountData();
    },
    async signOut() {
      try {
        await endSession();
      } finally {
        // Энэ browser-ийн дараагийн зочин энэ бүртгэлийн cart, захиалгыг харж болохгүй.
        for (const queryKey of accountKeys)
          queryClient.removeQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey: ["cart"] });
      }
    },
  };
}
