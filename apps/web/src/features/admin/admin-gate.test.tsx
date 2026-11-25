import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { testIntl } from "@/test/intl";
import { AdminGate, RoleGate } from "./admin-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/products",
}));

const user = { id: 1, email: "a@b.co", full_name: "Ada" };
const signIn = (role: "customer" | "admin" | "warehouse") =>
  useAuth.setState({ status: "signedIn", accessToken: "t", user: { ...user, role, avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] } });

beforeEach(() => {
  replace.mockClear();
  useAuth.setState({ status: "unknown", accessToken: null, user: null });
});

describe("AdminGate", () => {
  it("tells a customer in Mongolian that the area is not theirs", () => {
    testIntl.locale = "mn";
    signIn("customer");
    render(<AdminGate>secret</AdminGate>);

    expect(screen.getByText("Танд энэ хэсэгт хандах эрх алга")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Дэлгүүр рүү буцах" })).toHaveAttribute("href", "/");
  });

  it("shows the content to an administrator", () => {
    signIn("admin");
    render(<AdminGate>secret catalogue tools</AdminGate>);
    expect(screen.getByText("secret catalogue tools")).toBeInTheDocument();
  });

  it("shows the content to a warehouse worker", () => {
    signIn("warehouse");
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

describe("RoleGate", () => {
  it("opens a section to the role it is for", () => {
    signIn("warehouse");
    render(<RoleGate allow="warehouse">new product form</RoleGate>);
    expect(screen.getByText("new product form")).toBeInTheDocument();
  });

  it("keeps the other staff role out and points it back to its own workspace", () => {
    signIn("admin");
    render(<RoleGate allow="warehouse">new product form</RoleGate>);

    expect(screen.queryByText("new product form")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This section is not part of your role.");
    expect(screen.getByRole("link", { name: "Back to your workspace" })).toHaveAttribute("href", "/admin");
  });

  it("sends a warehouse worker who opens an admin-only section back to the warehouse board", () => {
    signIn("warehouse");
    render(<RoleGate allow="admin">customers</RoleGate>);

    expect(screen.queryByText("customers")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your workspace" })).toHaveAttribute("href", "/admin");
  });
});
