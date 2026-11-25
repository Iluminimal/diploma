import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { AccountGate } from "./account-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/account/orders",
}));

beforeEach(() => replace.mockReset());

describe("AccountGate", () => {
  it("sends a visitor whose session is gone to sign in and back to the page they asked for", async () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });

    render(
      <AccountGate>
        <p>Your orders</p>
      </AccountGate>,
    );

    expect(screen.queryByText("Your orders")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Faccount%2Forders"));
  });

  it.each(["unknown", "signedIn"] as const)("shows the page while the session is %s", (status) => {
    useAuth.setState({ status, accessToken: null, user: null });

    render(
      <AccountGate>
        <p>Your orders</p>
      </AccountGate>,
    );

    expect(screen.getByText("Your orders")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
