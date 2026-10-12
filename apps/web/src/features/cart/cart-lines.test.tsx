import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, stubApi } from "@/test/api-mock";
import { makeCart, makeCartLine, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { useCartDrawer } from "./cart-ui-store";
import { MiniCart } from "./mini-cart";

const notice = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign((...args: unknown[]) => notice(...args), { error: vi.fn() }) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/cart" }));

const kurta = makeProduct({ id: 1, name: "Blue Kurta", price_cents: 3000 });
const shoe = makeProduct({ id: 2, name: "White Sneaker", price_cents: 5000 });
const twoLines = () =>
  makeCart([
    makeCartLine({ id: 10, product: kurta, quantity: 2, max_quantity: 5 }),
    makeCartLine({ id: 11, product: shoe, quantity: 1, size: "9" }),
  ]);

beforeEach(() => {
  notice.mockReset();
  push.mockReset();
  useCartDrawer.setState({ open: false, added: null, removed: null });
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("cart lines", () => {
  it("offers to undo a removal, which puts the same size and quantity back", async () => {
    let server = twoLines();
    const api = stubApi({
      "GET /api/v1/cart": () => json(server),
      "DELETE /api/v1/cart/items/11": () => {
        server = makeCart([makeCartLine({ id: 10, product: kurta, quantity: 2 })]);
        return json(server);
      },
      "POST /api/v1/cart/items": () => json(twoLines()),
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("White Sneaker");

    await userEvent.click(screen.getByRole("button", { name: "Remove White Sneaker from your cart" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Removed White Sneaker");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(api.count("POST /api/v1/cart/items")).toBe(1));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ product_id: 2, size: "9", quantity: 1 });
  });

  it("asks a guest to sign in before saving a line for later", async () => {
    stubApi({ "GET /api/v1/cart": () => json(twoLines()) });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("White Sneaker");

    await userEvent.click(screen.getAllByRole("button", { name: /Save for later/ })[1]!);

    expect(notice).toHaveBeenCalledWith("Sign in to save items for later.");
    expect(push).toHaveBeenCalledWith("/login?next=%2Fcart");
  });

  it("moves a line to the wishlist for a signed-in customer", async () => {
    useAuth.setState({
      status: "signedIn",
      accessToken: "t",
      user: { id: 1, email: "a@b.co", phone: null, email_verified: false, phone_verified: false, full_name: "A", role: "customer", avatar_url: null, has_password: true, providers: [] },
    });
    let server = twoLines();
    const api = stubApi({
      "GET /api/v1/cart": () => json(server),
      "GET /api/v1/wishlist": () => json({ items: [] }),
      "PUT /api/v1/wishlist/2": () => json({ items: [shoe] }),
      "DELETE /api/v1/cart/items/11": () => {
        server = makeCart([makeCartLine({ id: 10, product: kurta, quantity: 2 })]);
        return json(server);
      },
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("White Sneaker");

    await userEvent.click(screen.getAllByRole("button", { name: /Save for later/ })[1]!);

    await waitFor(() => expect(screen.queryByText("White Sneaker")).not.toBeInTheDocument());
    expect(api.count("PUT /api/v1/wishlist/2")).toBe(1);
    expect(api.count("DELETE /api/v1/cart/items/11")).toBe(1);
    expect(notice).toHaveBeenCalledWith("Saved White Sneaker to your wishlist");
  });

  it("highlights the line that was just added", async () => {
    useCartDrawer.setState({ added: { productId: 2, size: "9" } });
    stubApi({ "GET /api/v1/cart": () => json(twoLines()) });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);

    const sneaker = (await screen.findByText("White Sneaker")).closest("li")!;
    const kurtaRow = screen.getByText("Blue Kurta").closest("li")!;

    expect(sneaker).toHaveClass("animate-highlight");
    expect(kurtaRow).not.toHaveClass("animate-highlight");
  });
});
