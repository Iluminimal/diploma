import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { BagPanel } from "./bag-panel";

vi.mock("next/dynamic", () => ({ default: () => () => <p>the items</p> }));

const customer = { id: 1, email: "a@b.co", phone: null, email_verified: false, phone_verified: false, full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, providers: [] as string[] };

beforeEach(() => useAuth.setState({ status: "signedOut", accessToken: null, user: null }));

function Harness({ startOpen = true }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return <BagPanel open={open} onOpenChange={setOpen} count={2} trigger={createRef<HTMLButtonElement>()} />;
}

describe("BagPanel", () => {
  it("is a page with the title, the items and a close button", async () => {
    render(<Harness />);

    const dialog = await screen.findByRole("dialog", { name: /^Bag/ });
    expect(within(dialog).getByText("the items")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close Bag" })).toBeInTheDocument();
  });

  it("tells the page it is open, so the phone bar fades everything but the X, and clears it on closing", async () => {
    render(<Harness />);
    await screen.findByRole("dialog");
    expect(document.documentElement).toHaveAttribute("data-bar-panel");

    await userEvent.click(screen.getByRole("button", { name: "Close Bag" }));

    expect(document.documentElement).not.toHaveAttribute("data-bar-panel");
  });

  it("offers Sign in under the items to a visitor", async () => {
    render(<Harness />);

    const profile = within(await screen.findByRole("navigation", { name: "My profile" }));
    expect(profile.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(profile.queryByRole("link", { name: "Orders" })).not.toBeInTheDocument();
  });

  it("lists the account pages under the items for a signed-in customer", async () => {
    useAuth.setState({ status: "signedIn", accessToken: "t", user: customer });
    render(<Harness />);

    const profile = within(await screen.findByRole("navigation", { name: "My profile" }));
    expect(profile.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/account/orders");
    expect(profile.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
