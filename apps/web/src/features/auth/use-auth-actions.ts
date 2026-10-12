"use client";

import { useQueryClient } from "@tanstack/react-query";
import { browserApi, call } from "@/lib/api/browser";
import { accountKeys } from "@/lib/query-keys";
import { useAuth } from "./auth-store";
import { endSession } from "./session";

type Credentials = { email: string; password: string };
type Registration = Credentials & { full_name: string };

/** Sign in / up / out. Each also refreshes the account data, since the guest cart is merged on the server. */
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
    /** Send a one-time code to a phone number or an email address (signing in and up are one step). */
    async requestCode(destination: string) {
      await call(
        browserApi().POST("/api/v1/auth/otp/request", { body: { destination } }),
      );
    },
    /**
     * Sign in (or up) with the code. `onNewUser` runs before the session is stored, so a page can
     * decide to ask for a name first instead of leaving at once. Resolves to `is_new_user`.
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
        // The next visitor of this browser must not see this account's cart or orders.
        for (const queryKey of accountKeys)
          queryClient.removeQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey: ["cart"] });
      }
    },
  };
}
