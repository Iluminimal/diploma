import { useAuth } from "./auth-store";

const SESSION_COOKIE = "lk_session";

/** `lk_session` is a non-secret marker the API sets next to the httpOnly refresh cookie. */
export function hasSessionCookie(): boolean {
  return (
    typeof document !== "undefined" &&
    document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_COOKIE}=`))
  );
}

function dropSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; Max-Age=0; Path=/`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let inflight: Promise<boolean> | null = null;

/**
 * Trade the refresh cookie for a new access token. Concurrent callers share one request: refresh
 * tokens rotate, so two parallel refreshes would make the second look like a replayed token.
 */
export function refreshSession(): Promise<boolean> {
  inflight ??= attemptRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function attemptRefresh(): Promise<boolean> {
  let rejected = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (response.ok) {
        useAuth.getState().setSession(await response.json());
        return true;
      }
      if (response.status !== 401) break;
      rejected = true;
    } catch {
      break; // offline or API down: not the same as "signed out"
    }
    // Another tab may have rotated the cookie a moment ago; one retry picks up the new one.
    if (attempt === 0) await sleep(150);
  }
  useAuth.getState().clear();
  if (rejected) dropSessionCookie();
  return false;
}

/** Called once on load: restore a session from the cookie, or settle on "signed out". */
export async function bootstrapSession(): Promise<void> {
  if (useAuth.getState().status !== "unknown") return;
  if (hasSessionCookie()) await refreshSession();
  else useAuth.getState().clear();
}

export async function endSession(): Promise<void> {
  try {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } finally {
    useAuth.getState().clear();
    dropSessionCookie();
  }
}
