import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useAuth } from "./auth-store";
import { ForgotPasswordForm } from "./forgot-password-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const session = {
  access_token: "t2",
  token_type: "bearer",
  expires_in: 900,
  is_new_user: false,
  user: { id: 1, email: "ada@example.com", phone: null, email_verified: true, phone_verified: false, full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, providers: [] as string[] },
};
const emptyCart = { lines: [], item_count: 0, subtotal_cents: 0, currency: "USD", has_issues: false };

beforeEach(() => {
  replace.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("ForgotPasswordForm", () => {
  it("asks for a code, then sets the new password and signs in", async () => {
    const api = stubApi({
      "POST /api/v1/auth/password/forgot": { status: 202 },
      "POST /api/v1/auth/password/reset": json(session),
      "GET /api/v1/cart": json(emptyCart),
    });
    renderWithQuery(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText("Email or phone number"), " ada@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByText(/we sent it a 6-digit code/);
    await userEvent.keyboard("246810");
    await userEvent.type(screen.getByLabelText("New password"), "a brand new passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(api.calls[0]?.body).toEqual({ destination: "ada@example.com" });
    expect(api.calls[1]?.body).toEqual({
      destination: "ada@example.com",
      code: "246810",
      new_password: "a brand new passphrase",
    });
    expect(useAuth.getState()).toMatchObject({ status: "signedIn", accessToken: "t2" });
  });

  it("does not call the API for an empty field", async () => {
    const api = stubApi({});
    renderWithQuery(<ForgotPasswordForm />);

    await userEvent.click(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Enter the email or phone number on your account.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("needs a full code and a long enough password", async () => {
    const api = stubApi({ "POST /api/v1/auth/password/forgot": { status: 202 } });
    renderWithQuery(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email or phone number"), "+14155552671");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByText(/we sent it a 6-digit code/);

    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6-digit code.");

    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("246810");
    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Use at least 10 characters for the new password.")).toBeInTheDocument();
    expect(api.calls).toHaveLength(1);
  });

  it("shows a wrong code and keeps the form", async () => {
    stubApi({
      "POST /api/v1/auth/password/forgot": { status: 202 },
      "POST /api/v1/auth/password/reset": problem(400, "That code is not right", {
        type: "urn:angel:problem:otp-invalid",
      }),
    });
    renderWithQuery(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email or phone number"), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByText(/we sent it a 6-digit code/);
    await userEvent.keyboard("000000");
    await userEvent.type(screen.getByLabelText("New password"), "a brand new passphrase");

    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn't right");
    expect(replace).not.toHaveBeenCalled();
  });
});
