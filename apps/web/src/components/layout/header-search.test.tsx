import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { announceFlyout } from "./bar-flyout";
import { HeaderSearch } from "./header-search";

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

  it("tells the page it is open, so the phone bar fades everything but the X, and clears it on closing", async () => {
    render(<HeaderSearch />);

    await userEvent.click(magnifier());
    expect(document.documentElement).toHaveAttribute("data-bar-panel");
    expect(magnifier()).toHaveClass("phone-bar-item");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute("data-bar-panel"));
  });

  it("has no logo in its phone bar: only the X is left of the bar", async () => {
    render(<HeaderSearch />);

    await userEvent.click(magnifier());

    const dialog = await screen.findByRole("dialog", { name: "Search" });
    expect(dialog.querySelector('a[href="/"]')).toBeNull();
  });

  it("closes again when the magnifier is pressed, and the bar stays", async () => {
    render(<HeaderSearch />);

    await userEvent.click(magnifier());
    expect(isOpen()).toBe(true);
    await userEvent.click(magnifier());

    expect(isOpen()).toBe(false);
  });

  it("grows from the bar down from md up, as tall as its content, so the bar stays in view", async () => {
    render(<HeaderSearch />);

    await userEvent.click(magnifier());

    const dialog = await screen.findByRole("dialog", { name: "Search" });
    expect(dialog).toHaveClass("md:top-[2.8125rem]", "md:h-auto", "md:max-h-[calc(100dvh-2.8125rem)]");
    expect(screen.queryByRole("button", { name: "Close search" })).toBeInTheDocument(); // утасны bar-ын X
  });

  it("makes way when another flyout opens under the bar (a department menu or the Bag)", async () => {
    render(<HeaderSearch />);
    await userEvent.click(magnifier());
    expect(isOpen()).toBe(true);

    act(() => announceFlyout("menu"));

    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("announces itself when it opens, so the others close", async () => {
    const heard = vi.fn();
    window.addEventListener("bar-flyout", (event) => heard((event as CustomEvent).detail));
    render(<HeaderSearch />);

    await userEvent.click(magnifier());

    expect(heard).toHaveBeenCalledWith("search");
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
          <div role="dialog" aria-label="Bag">
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
