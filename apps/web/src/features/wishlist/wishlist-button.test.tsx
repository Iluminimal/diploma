import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { stubApi } from "@/test/api-mock";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { WishlistButton } from "./wishlist-button";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/products/41885/alma-women-blue-kurta-60000",
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const product = makeProduct();
const user = { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, providers: [] as string[] };

beforeEach(() => push.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("WishlistButton", () => {
  it("sends a guest to sign in and brings them back to this product", async () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });
    const api = stubApi({});
    renderWithQuery(<WishlistButton product={product} />);

    await userEvent.click(screen.getByRole("button", { name: /save alma women blue kurta/i }));

    expect(push).toHaveBeenCalledWith(
      "/login?next=%2Fproducts%2F41885%2Falma-women-blue-kurta-60000",
    );
    expect(api.calls).toHaveLength(0); // guests never hit the wishlist API
  });

  it("saves optimistically for a signed-in shopper", async () => {
    useAuth.setState({ status: "signedIn", accessToken: "t", user });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = stubApi({
      "GET /api/v1/wishlist": { body: { items: [] } },
      "PUT /api/v1/wishlist/41885": async () => {
        await gate;
        return new Response(null, { status: 204 });
      },
    });
    renderWithQuery(<WishlistButton product={product} />);
    const button = await screen.findByRole("button", { name: /save alma women blue kurta/i });
    await waitFor(() => expect(api.count("GET /api/v1/wishlist")).toBe(1));

    await userEvent.click(button);

    expect(await screen.findByRole("button", { name: /remove alma women blue kurta/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    release();
    await waitFor(() => expect(api.count("PUT /api/v1/wishlist/41885")).toBe(1));
  });

  it("shows products already on the wishlist as saved, and removes them", async () => {
    useAuth.setState({ status: "signedIn", accessToken: "t", user });
    const api = stubApi({
      "GET /api/v1/wishlist": { body: { items: [product] } },
      "DELETE /api/v1/wishlist/41885": new Response(null, { status: 204 }),
    });
    renderWithQuery(<WishlistButton product={product} variant="button" />);

    const button = await screen.findByRole("button", { name: /saved/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);

    await waitFor(() => expect(api.count("DELETE /api/v1/wishlist/41885")).toBe(1));
    expect(push).not.toHaveBeenCalled();
  });
});
