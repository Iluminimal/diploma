import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { catalogNav } from "@/test/fixtures";
import { MobileNav } from "./mobile-nav";
import { useSearchPanel } from "./search-ui-store";

vi.mock("@/features/catalog/use-catalog-nav", () => ({ useCatalogNav: () => ({ data: catalogNav, isPending: false }) }));
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));

const trigger = () => screen.getByRole("button", { name: /^(Open|Close) menu$/ });
const menu = () => screen.getByRole("dialog", { name: "Menu", hidden: true });

beforeEach(() => {
  pathname = "/";
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
  useSearchPanel.setState({ requests: 0 });
  document.documentElement.style.overflow = "";
});

async function open() {
  render(
    <>
      <main id="main">page</main>
      <MobileNav />
    </>,
  );
  await userEvent.click(trigger());
  await screen.findByRole("dialog", { name: "Menu" });
}

describe("the phone menu button and page", () => {
  it("is closed to begin with, and its button becomes an X (Close menu) when pressed", async () => {
    render(<MobileNav />);
    expect(trigger()).toHaveAttribute("aria-label", "Open menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-label", "Close menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("dialog", { name: "Menu" })).toHaveAttribute("data-open", "true");
  });

  it("holds a search field and the shop in large type, and only that: no cart or account icons", async () => {
    await open();

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toHaveTextContent("Search");
    for (const name of ["Women", "Men", "Kids"]) {
      expect(screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("href", "/products?sort=newest");
    expect(screen.queryByRole("button", { name: /^Cart/ })).not.toBeInTheDocument();
  });

  it("drills from a department to an article type and back", async () => {
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Men" }));
    expect(screen.getByRole("heading", { name: "Men" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop all Men" })).toHaveAttribute("href", "/c/men");

    await userEvent.click(screen.getByRole("button", { name: "Clothing" }));
    await userEvent.click(screen.getByRole("button", { name: "Topwear" }));
    expect(screen.getByRole("link", { name: "T-shirts" })).toHaveAttribute("href", "/c/men/apparel/topwear/tshirts");

    await userEvent.click(screen.getByRole("button", { name: "Back to Clothing" }));
    expect(screen.getByRole("heading", { name: "Clothing" })).toBeInTheDocument();
  });

  it("makes a department without data an ordinary link", async () => {
    await open();

    expect(screen.getByRole("link", { name: "Kids" })).toHaveAttribute("href", "/c/kids");
  });

  it("offers the account at the bottom: Sign in for a visitor, the account pages once signed in", async () => {
    await open();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "Orders" })).not.toBeInTheDocument();
  });

  it("lists the account pages for a signed-in customer", async () => {
    useAuth.setState({
      status: "signedIn",
      accessToken: "t",
      user: { id: 1, email: "a@b.co", phone: null, email_verified: false, phone_verified: false, full_name: "Ada", role: "customer", avatar_url: null, has_password: true, providers: [] },
    });
    await open();

    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/account/orders");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("keeps the page behind out of reach while it is open, and gives it back on closing", async () => {
    await open();
    expect(document.getElementById("main")).toHaveAttribute("inert");
    expect(document.documentElement.style.overflow).toBe("hidden");

    await userEvent.click(trigger());

    expect(document.getElementById("main")).not.toHaveAttribute("inert");
    expect(document.documentElement.style.overflow).toBe("");
    expect(menu()).toHaveAttribute("data-open", "false");
  });

  it("closes with Escape and returns focus to the button", async () => {
    await open();

    await userEvent.keyboard("{Escape}");

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveFocus();
  });

  it("closes and asks for the search panel when the search field is pressed", async () => {
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(useSearchPanel.getState().requests).toBe(1);
  });

  it("closes by itself when the page changes", async () => {
    function Harness() {
      const [, force] = useState(0);
      return (
        <>
          <MobileNav />
          <button onClick={() => force((n) => n + 1)}>rerender</button>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");

    pathname = "/products";
    await act(async () => {
      await userEvent.click(screen.getByText("rerender"));
    });

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });
});
