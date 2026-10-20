import { create } from "zustand";
import type { components } from "@/lib/api/client";

export type SessionUser = components["schemas"]["UserOut"];
type SessionResponse = components["schemas"]["SessionOut"];

/** Эхний refresh оролдлого дуустал `unknown`; UI "нэвтрээгүй" гэж анивчихын оронд хүлээнэ. */
export type AuthStatus = "unknown" | "signedIn" | "signedOut";

type AuthState = {
  status: AuthStatus;
  /** Зөвхөн санах ойд хадгална. Дахин ачаалахад httpOnly refresh cookie-оос шинийг авна. */
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
