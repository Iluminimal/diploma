import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useAuth } from "./auth-store";
import { SignInTabs } from "./sign-in-tabs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

beforeEach(() => {
  stubApi({});
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("SignInTabs", () => {
  it("starts on the phone tab", () => {
    renderWithQuery(<SignInTabs next="/" />);

    expect(screen.getByRole("tab", { name: "Phone" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("can start on the email tab", () => {
    renderWithQuery(<SignInTabs next="/" initial="email" />);

    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("switches between phone, email with a password, and email with a code", async () => {
    renderWithQuery(<SignInTabs next="/" />);

    await userEvent.click(screen.getByRole("tab", { name: "Email" }));
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send code" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Use a password instead" }));
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Phone" }));
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
  });

  it("links to the password reset", () => {
    renderWithQuery(<SignInTabs next="/" />);

    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
  });
});
