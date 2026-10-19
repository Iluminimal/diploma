import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { catalogNav } from "@/test/fixtures";
import { MobileNav } from "./mobile-nav";

vi.mock("@/features/catalog/use-catalog-nav", () => ({ useCatalogNav: () => ({ data: catalogNav, isPending: false }) }));
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));

const trigger = () => screen.getByRole("button", { name: /^(Open|Close) menu$/ });
const menu = () => screen.getByRole("dialog", { name: "Menu", hidden: true });

beforeEach(() => {
  pathname = "/";
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
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

  it("holds the shop in large type, and only that: no search field, cart or account", async () => {
    await open();

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    for (const name of ["Women", "Men", "Kids"]) {
      expect(screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("href", "/products?sort=newest");
    expect(within(dialog).queryByRole("button", { name: "Search" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bag/ })).not.toBeInTheDocument();
  });

  it("tells the page it is open, so the bar can fade everything but the X, and clears it on closing", async () => {
    await open();
    expect(document.documentElement).toHaveAttribute("data-bar-panel");

    await userEvent.click(trigger());

    expect(document.documentElement).not.toHaveAttribute("data-bar-panel");
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
