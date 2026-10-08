import { create } from "zustand";
import type { components } from "@/lib/api/client";

export type SessionUser = components["schemas"]["UserOut"];
type SessionResponse = components["schemas"]["SessionOut"];

/** `unknown` until the first refresh attempt finishes; the UI waits instead of flashing "signed out". */
export type AuthStatus = "unknown" | "signedIn" | "signedOut";

type AuthState = {
  status: AuthStatus;
  /** Lives in memory only. A reload gets a new one from the httpOnly refresh cookie. */
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (session: Pick<SessionResponse, "access_token" | "user">) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  status: "unknown",
  accessToken: null,
  user: null,
  setSession: ({ access_token, user }) =>
    set({ status: "signedIn", accessToken: access_token, user }),
  clear: () => set({ status: "signedOut", accessToken: null, user: null }),
}));
