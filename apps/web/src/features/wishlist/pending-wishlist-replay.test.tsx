import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { stubApi } from "@/test/api-mock";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { PendingWishlistReplay } from "./pending-wishlist-replay";
import { rememberPendingWishlist, takePendingWishlist } from "./pending-wishlist";

const success = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: (m: string) => success(m) }) }));

const product = makeProduct({ id: 7, name: "Blue Kurta" });
const user = { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] };

beforeEach(() => {
  success.mockReset();
  window.sessionStorage.clear();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("pending wishlist", () => {
  it("remembers a product once and forgets it when taken", () => {
    rememberPendingWishlist(product);

    expect(takePendingWishlist()?.id).toBe(7);
    expect(takePendingWishlist()).toBeNull();
  });

  it("ignores garbage in storage", () => {
    window.sessionStorage.setItem("angel:pending-wishlist", "{not json");
    expect(takePendingWishlist()).toBeNull();
  });
});

describe("PendingWishlistReplay", () => {
  it("saves the product a guest hearted once they have signed in", async () => {
    rememberPendingWishlist(product);
    const api = stubApi({
      "GET /api/v1/wishlist": { body: { items: [] } },
      "PUT /api/v1/wishlist/7": { status: 204 },
    });
    renderWithQuery(<PendingWishlistReplay />);
    expect(api.calls).toHaveLength(0); // зочин: юу ч хийхгүй

    act(() => useAuth.setState({ status: "signedIn", accessToken: "t", user }));

    await waitFor(() => expect(api.count("PUT /api/v1/wishlist/7")).toBe(1));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Saved Blue Kurta to your wishlist"));
    expect(takePendingWishlist()).toBeNull(); // нэг л удаа
  });

  it("does nothing for a customer who did not heart anything as a guest", async () => {
    const api = stubApi({ "GET /api/v1/wishlist": { body: { items: [] } } });
    renderWithQuery(<PendingWishlistReplay />);

    act(() => useAuth.setState({ status: "signedIn", accessToken: "t", user }));

    await waitFor(() => expect(screen.queryByText(/./)).toBeNull());
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
  });
});
