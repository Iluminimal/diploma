import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeaderSearch } from "./header-search";
import { useSearchPanel } from "./search-ui-store";

vi.mock("./search-bar", () => ({ SearchBar: () => <input role="combobox" aria-label="Search products" aria-expanded={false} aria-controls="list" /> }));

const magnifier = () => screen.getByRole("button", { name: "Search" });
const isOpen = () => magnifier().getAttribute("aria-expanded") === "true";

describe("HeaderSearch", () => {
  it("opens from the magnifier and closes with Escape, returning focus to it", async () => {
    render(<HeaderSearch />);

    await userEvent.click(magnifier());
    expect(isOpen()).toBe(true);
    expect(await screen.findByRole("combobox")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("opens when another part of the page asks (the phone tab bar's Search tab)", async () => {
    render(<HeaderSearch />);
    expect(isOpen()).toBe(false);

    act(() => useSearchPanel.getState().request());

    await waitFor(() => expect(isOpen()).toBe(true));
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("advertises the / shortcut", () => {
    render(<HeaderSearch />);

    expect(magnifier()).toHaveAttribute("aria-keyshortcuts", "/");
    expect(magnifier()).toHaveAttribute("title", "Search (press /)");
  });

  describe("the / shortcut", () => {
    it("opens search from anywhere on the page", async () => {
      render(<HeaderSearch />);

      await userEvent.keyboard("/");

      await waitFor(() => expect(isOpen()).toBe(true));
      expect(await screen.findByRole("combobox")).toBeInTheDocument();
    });

    it("does not steal the key from a field: a slash typed there is a slash", async () => {
      render(
        <>
          <HeaderSearch />
          <input aria-label="Email" />
          <textarea aria-label="Notes" />
        </>,
      );

      await userEvent.type(screen.getByLabelText("Email"), "a/b");
      await userEvent.type(screen.getByLabelText("Notes"), "c/d");

      expect(screen.getByLabelText("Email")).toHaveValue("a/b");
      expect(screen.getByLabelText("Notes")).toHaveValue("c/d");
      expect(isOpen()).toBe(false);
    });

    it("leaves a dialog alone", async () => {
      render(
        <>
          <HeaderSearch />
          <div role="dialog" aria-label="Cart">
            <button type="button">Checkout</button>
          </div>
        </>,
      );
      screen.getByRole("button", { name: "Checkout" }).focus();

      await userEvent.keyboard("/");

      expect(isOpen()).toBe(false);
    });

    it.each([["ctrlKey"], ["metaKey"], ["altKey"]])("ignores / with %s held", (modifier) => {
      render(<HeaderSearch />);

      fireEvent.keyDown(document.body, { key: "/", [modifier]: true });

      expect(isOpen()).toBe(false);
    });

    it("ignores other keys", async () => {
      render(<HeaderSearch />);

      await userEvent.keyboard("s?\\");

      expect(isOpen()).toBe(false);
    });

    it("does not type the slash into the field it opens", async () => {
      render(<HeaderSearch />);

      await userEvent.keyboard("/");
      const field = await screen.findByRole("combobox");

      expect(field).toHaveValue("");
    });
  });
});
