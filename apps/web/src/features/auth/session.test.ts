import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "./auth-store";
import { bootstrapSession, endSession, refreshSession } from "./session";

const session = {
  access_token: "token-1",
  token_type: "bearer",
  expires_in: 900,
  user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, providers: [] as string[] },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  useAuth.setState({ status: "unknown", accessToken: null, user: null });
  document.cookie = "lk_session=1; Path=/";
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "lk_session=; Max-Age=0; Path=/";
});

describe("refreshSession", () => {
  it("signs in with the new access token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(session)));

    expect(await refreshSession()).toBe(true);

    expect(useAuth.getState()).toMatchObject({
      status: "signedIn",
      accessToken: "token-1",
    });
    expect(useAuth.getState().user?.email).toBe("ada@example.com");
  });

  it("shares one request between concurrent callers (refresh tokens rotate)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(session));
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once when another tab rotated the cookie first", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ title: "Not signed in", status: 401 }, 401))
      .mockResolvedValueOnce(json(session));
    vi.stubGlobal("fetch", fetchMock);

    expect(await refreshSession()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("signs out and removes the marker cookie when the cookie is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(json({ title: "Not signed in", status: 401 }, 401)),
    );

    expect(await refreshSession()).toBe(false);

    expect(useAuth.getState().status).toBe("signedOut");
    expect(document.cookie).not.toContain("lk_session");
  });

  it("keeps the marker cookie when the API is simply unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    expect(await refreshSession()).toBe(false);

    expect(useAuth.getState().status).toBe("signedOut");
    expect(document.cookie).toContain("lk_session");
  });
});

describe("bootstrapSession", () => {
  it("restores the session when the marker cookie exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(session)));

    await bootstrapSession();

    expect(useAuth.getState().status).toBe("signedIn");
  });

  it("settles on signed out without a request when there is no marker cookie", async () => {
    document.cookie = "lk_session=; Max-Age=0; Path=/";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await bootstrapSession();

    expect(useAuth.getState().status).toBe("signedOut");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("endSession", () => {
  it("clears the session even if the logout request fails", async () => {
    useAuth.getState().setSession(session);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(endSession()).rejects.toThrow();

    expect(useAuth.getState()).toMatchObject({
      status: "signedOut",
      accessToken: null,
      user: null,
    });
  });
});
