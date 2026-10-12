import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/render";
import { AccountDropdown } from "./account-dropdown";
import type { SessionUser } from "./auth-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const user = (role: SessionUser["role"]): SessionUser => ({
  id: 1,
  email: "a@b.co",
  full_name: "Ada Lovelace",
  role,
  avatar_url: null,
  has_password: true,
  providers: [],
});

describe("AccountDropdown", () => {
  it("takes an administrator to the admin area", () => {
    renderWithQuery(<AccountDropdown user={user("admin")} defaultOpen />);

    expect(screen.getByRole("menuitem", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("has no admin link for a customer", () => {
    renderWithQuery(<AccountDropdown user={user("customer")} defaultOpen />);

    expect(screen.getByRole("menuitem", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Admin" })).not.toBeInTheDocument();
  });
});
