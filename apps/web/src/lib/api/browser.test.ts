import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { ApiError } from "./errors";
import { browserApi, call } from "./browser";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const emptyCart = {
  lines: [],
  item_count: 0,
  subtotal_cents: 0,
  currency: "USD",
  has_issues: false,
};
const session = {
  access_token: "fresh-token",
  token_type: "bearer",
  expires_in: 900,
  user: { id: 1, email: "ada@example.com", full_name: "Ada" },
};

beforeEach(() => {
  useAuth.setState({
    status: "signedIn",
    accessToken: "old-token",
    user: session.user,
  });
  document.cookie = "lk_session=1; Path=/";
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "lk_session=; Max-Age=0; Path=/";
});

function authorization(call: unknown[]): string | null {
  return (call[0] as Request).headers.get("Authorization");
}

describe("browserApi", () => {
  it("sends the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(emptyCart));
    vi.stubGlobal("fetch", fetchMock);

    await call(browserApi().GET("/api/v1/cart"));

    expect(authorization(fetchMock.mock.calls[0]!)).toBe("Bearer old-token");
  });

  it("refreshes once on a 401 and repeats the request with the new token, body included", async () => {
    const fetchMock = vi.fn(async (input: Request | string) => {
      if (typeof input === "string") return json(session); // the refresh call
      return input.headers.get("Authorization") === "Bearer fresh-token"
        ? json(emptyCart)
        : json({ title: "Not signed in", status: 401 }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    const cart = await call(
      browserApi().POST("/api/v1/cart/items", {
        body: { product_id: 1, size: "M", quantity: 1 },
      }),
    );

    expect(cart.item_count).toBe(0);
    expect(useAuth.getState().accessToken).toBe("fresh-token");
    const paths = fetchMock.mock.calls.map(
      ([r]) =>
        new URL(
          typeof r === "string" ? r : (r as Request).url,
          "http://localhost:3000",
        ).pathname,
    );
    expect(paths).toEqual([
      "/api/v1/cart/items",
      "/api/v1/auth/refresh",
      "/api/v1/cart/items",
    ]);
    const retried = fetchMock.mock.calls[2]![0] as Request;
    expect(await retried.json()).toEqual({
      product_id: 1,
      size: "M",
      quantity: 1,
    });
  });

  it("does not try to refresh when a login attempt is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json(
        {
          title: "Invalid",
          status: 401,
          type: "urn:lookalike:problem:invalid-credentials",
        },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      call(
        browserApi().POST("/api/v1/auth/login", {
          body: { email: "a@b.co", password: "x" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves a plain guest's 401 alone", async () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });
    document.cookie = "lk_session=; Max-Age=0; Path=/";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ title: "Not signed in", status: 401 }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      call(browserApi().GET("/api/v1/orders")),
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("call", () => {
  it("turns problem responses into ApiErrors with their extension members", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          {
            title: "Not enough stock",
            status: 409,
            type: "urn:lookalike:problem:insufficient-stock",
            available: 3,
          },
          409,
        ),
      ),
    );

    const error = await call(
      browserApi().POST("/api/v1/cart/items", {
        body: { product_id: 1, size: "M", quantity: 9 },
      }),
    ).then(
      () => {
        throw new Error("expected a rejection");
      },
      (e: unknown) => e as ApiError,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.is("insufficientStock")).toBe(true);
    expect(error.extensions.available).toBe(3);
  });

  it("reports an unreachable server as status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(call(browserApi().GET("/api/v1/cart"))).rejects.toMatchObject({
      status: 0,
    });
  });
});
