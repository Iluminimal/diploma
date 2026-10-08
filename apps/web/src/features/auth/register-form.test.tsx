import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useAuth } from "./auth-store";
import { RegisterForm } from "./register-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const session = {
  access_token: "t1",
  token_type: "bearer",
  expires_in: 900,
  user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const },
};

beforeEach(() => {
  replace.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

async function fill(password = "correct horse battery") {
  await userEvent.type(screen.getByLabelText("Full name"), "Ada Lovelace");
  await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("RegisterForm", () => {
  it("asks for a password of at least 10 characters without calling the API", async () => {
    const api = stubApi({});
    renderWithQuery(<RegisterForm next="/" />);

    await fill("short");

    expect(await screen.findByText("Use at least 10 characters")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("creates the account, signs in and continues", async () => {
    const api = stubApi({
      "POST /api/v1/auth/register": json(session, 201),
      "GET /api/v1/cart": json({ lines: [], item_count: 0, subtotal_cents: 0, currency: "USD", has_issues: false }),
    });
    renderWithQuery(<RegisterForm next="/cart" />);

    await fill();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    expect(api.calls[0]?.body).toEqual({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct horse battery",
    });
    expect(useAuth.getState().status).toBe("signedIn");
  });

  it("puts the 'email already registered' error on the email field", async () => {
    stubApi({
      "POST /api/v1/auth/register": problem(409, "Email already registered", {
        type: "urn:lookalike:problem:email-taken",
      }),
    });
    renderWithQuery(<RegisterForm next="/" />);

    await fill();

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(replace).not.toHaveBeenCalled();
  });
});
