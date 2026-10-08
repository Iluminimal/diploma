import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useAuth } from "./auth-store";
import { LoginForm } from "./login-form";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

const session = {
  access_token: "t1",
  token_type: "bearer",
  expires_in: 900,
  user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const },
};

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("LoginForm", () => {
  it("validates before calling the API", async () => {
    const api = stubApi({});
    renderWithQuery(<LoginForm next="/" />);

    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("signs in, stores the session and goes to the requested page", async () => {
    const api = stubApi({
      "POST /api/v1/auth/login": json(session),
      "GET /api/v1/cart": json({ lines: [], item_count: 0, subtotal_cents: 0, currency: "USD", has_issues: false }),
    });
    renderWithQuery(<LoginForm next="/checkout" />);

    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout"));
    expect(api.calls[0]?.body).toEqual({ email: "ada@example.com", password: "correct horse battery" });
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", accessToken: "t1" });
  });

  it("shows a friendly message for wrong credentials and stays on the page", async () => {
    stubApi({
      "POST /api/v1/auth/login": problem(401, "Invalid email or password", {
        type: "urn:lookalike:problem:invalid-credentials",
      }),
    });
    renderWithQuery(<LoginForm next="/" />);

    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
    expect(replace).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe("signedOut");
  });

  it("keeps the destination when the shopper switches to registering", () => {
    renderWithQuery(<LoginForm next="/checkout" />);

    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/register?next=%2Fcheckout",
    );
  });

  it("sends someone who is already signed in straight on", () => {
    useAuth.setState({ status: "signedIn", accessToken: "t", user: session.user });
    renderWithQuery(<LoginForm next="/account/orders" />);

    expect(replace).toHaveBeenCalledWith("/account/orders");
  });
});
