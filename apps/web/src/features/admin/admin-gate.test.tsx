import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { AdminGate } from "./admin-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/products",
}));

const user = { id: 1, email: "a@b.co", full_name: "Ada" };
const signIn = (role: "customer" | "admin") =>
  useAuth.setState({ status: "signedIn", accessToken: "t", user: { ...user, role, avatar_url: null, has_password: true, providers: [] as string[] } });

beforeEach(() => {
  replace.mockClear();
  useAuth.setState({ status: "unknown", accessToken: null, user: null });
});

describe("AdminGate", () => {
  it("shows the content to an administrator", () => {
    signIn("admin");
    render(<AdminGate>secret catalogue tools</AdminGate>);
    expect(screen.getByText("secret catalogue tools")).toBeInTheDocument();
  });

  it("tells a customer they have no access and renders nothing else", () => {
    signIn("customer");
    render(<AdminGate>secret catalogue tools</AdminGate>);

    expect(screen.getByRole("alert")).toHaveTextContent("You don't have access to this area");
    expect(screen.queryByText("secret catalogue tools")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("waits while the session is still being restored", () => {
    render(<AdminGate>secret catalogue tools</AdminGate>);

    expect(screen.getByLabelText("Checking your access")).toBeInTheDocument();
    expect(screen.queryByText("secret catalogue tools")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a visitor who is signed out to the login page and back afterwards", async () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });
    render(<AdminGate>secret catalogue tools</AdminGate>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fadmin%2Fproducts"));
    expect(screen.queryByText("secret catalogue tools")).not.toBeInTheDocument();
  });
});
