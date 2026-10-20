import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogNav } from "@/test/fixtures";
import { announceFlyout } from "./bar-flyout";
import { MegaMenu } from "./mega-menu";

let data: typeof catalogNav | undefined = catalogNav;
vi.mock("@/features/catalog/use-catalog-nav", () => ({ useCatalogNav: () => ({ data }) }));

const trigger = (name: string) => screen.getByRole("link", { name });
const region = (name: string) => screen.getByRole("region", { name: `${name} categories`, hidden: true });
const panel = (name: string) => within(region(name));
const flyout = () => document.querySelector<HTMLElement>(".mega-flyout")!;
const expanded = (name: string) => trigger(name).getAttribute("aria-expanded");

afterEach(() => {
  data = catalogNav;
  vi.unstubAllGlobals();
});

describe("MegaMenu", () => {
  it("renders the departments as links before any data arrives", () => {
    data = undefined;
    render(<MegaMenu />);

    expect(trigger("Women")).toHaveAttribute("href", "/c/women");
    expect(trigger("Men")).toHaveAttribute("href", "/c/men");
    expect(trigger("Kids")).toHaveAttribute("href", "/c/kids");
    expect(trigger("New")).toHaveAttribute("href", "/products?sort=newest");
    expect(trigger("Men")).not.toHaveAttribute("aria-expanded");
  });

  it("opens the shared flyout on hover and closes it when the pointer leaves", async () => {
    render(<MegaMenu />);
    expect(flyout()).toHaveAttribute("data-open", "false");

    await userEvent.hover(trigger("Men"));
    await waitFor(() => expect(expanded("Men")).toBe("true"));
    expect(flyout()).toHaveAttribute("data-open", "true");
    expect(panel("Men").getByRole("link", { name: "Topwear" })).toHaveAttribute("href", "/c/men/apparel/topwear");

    await userEvent.unhover(trigger("Men"));
    await waitFor(() => expect(flyout()).toHaveAttribute("data-open", "false"));
    expect(expanded("Men")).toBe("false");
  });

  it("has one flyout for every department, and switching between them is immediate", async () => {
    render(<MegaMenu />);
    expect(document.querySelectorAll(".mega-flyout")).toHaveLength(1);
    await userEvent.hover(trigger("Men"));
    await waitFor(() => expect(expanded("Men")).toBe("true"));

    await userEvent.hover(trigger("Women"));

    // Хүлээлтгүй: flyout нээлттэй үлдэж өөр department-ийг харуулна.
    expect(expanded("Women")).toBe("true");
    expect(expanded("Men")).toBe("false");
    expect(flyout()).toHaveAttribute("data-open", "true");
    expect(region("Women")).toHaveAttribute("data-active", "true");
    expect(region("Men")).toHaveAttribute("data-active", "false");
  });

  it("makes way when the search or the Bag opens under the bar, and announces itself when it opens", async () => {
    const heard: unknown[] = [];
    window.addEventListener("bar-flyout", (event) => heard.push((event as CustomEvent).detail));
    render(<MegaMenu />);

    await userEvent.hover(trigger("Men"));
    await waitFor(() => expect(flyout()).toHaveAttribute("data-open", "true"));
    expect(heard).toContain("menu");

    act(() => announceFlyout("search"));

    await waitFor(() => expect(flyout()).toHaveAttribute("data-open", "false"));
  });

  it("closes when the pointer goes to an entry that has no flyout", async () => {
    render(<MegaMenu />);
    await userEvent.hover(trigger("Men"));
    await waitFor(() => expect(flyout()).toHaveAttribute("data-open", "true"));

    await userEvent.hover(trigger("New"));

    await waitFor(() => expect(flyout()).toHaveAttribute("data-open", "false"));
  });

  it("stays open while the pointer moves from the bar into the flyout", async () => {
    render(<MegaMenu />);
    await userEvent.hover(trigger("Men"));
    await waitFor(() => expect(flyout()).toHaveAttribute("data-open", "true"));

    await userEvent.hover(panel("Men").getByRole("link", { name: "Topwear" }));
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(flyout()).toHaveAttribute("data-open", "true");
  });

  it("lists popular article types and numbers each link for the fade-in sequence", () => {
    render(<MegaMenu />);

    const link = panel("Men").getByRole("link", { name: "T-shirts" });
    expect(link).toHaveAttribute("href", "/c/men/apparel/topwear/tshirts");
    expect(link.closest(".mega-item")?.getAttribute("style")).toMatch(/--i: \d+/);
  });

  it("is as tall as the department it shows when open, and nothing when closed", async () => {
    // jsdom-д layout байхгүй: харагдаж буй агуулгын өндөр 420px гэж хэлээд, ажиглагдахад мэдэгднэ.
    vi.stubGlobal("ResizeObserver", class { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} });
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(420);
    render(<MegaMenu />);
    expect(flyout().style.height).toBe("0px");

    await userEvent.hover(trigger("Men"));

    await waitFor(() => expect(flyout().style.height).toBe("420px"));
    height.mockRestore();
  });

  it("is not as tall as the screen: it grows with its content", () => {
    render(<MegaMenu />);

    expect(flyout().className).not.toMatch(/(^| )h-\[/);
    expect(flyout().className).toContain("max-h-[calc(100dvh-2.8125rem)]");
  });

  describe("touch", () => {
    it("opens the flyout on the first tap instead of leaving the page", () => {
      render(<MegaMenu />);
      fireEvent.pointerDown(trigger("Men"), { pointerType: "touch" });

      const followed = fireEvent.click(trigger("Men"), { detail: 1 });

      expect(followed).toBe(false); // preventDefault дуудагдсан: навигаци болоогүй
      expect(expanded("Men")).toBe("true");
    });

    it("does not treat a mouse click as a tap", () => {
      render(<MegaMenu />);
      fireEvent.pointerDown(trigger("Men"), { pointerType: "mouse" });
      fireEvent.click(trigger("Men"), { detail: 1 });

      expect(expanded("Men")).toBe("false");
    });
  });

  describe("keyboard", () => {
    it("ArrowDown moves into the flyout and Escape returns to the department link", async () => {
      render(<MegaMenu />);
      trigger("Men").focus();

      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() => expect(expanded("Men")).toBe("true"));
      await waitFor(() => expect(panel("Men").getAllByRole("link")[0]).toHaveFocus());

      await userEvent.keyboard("{Escape}");
      expect(expanded("Men")).toBe("false");
      expect(trigger("Men")).toHaveFocus();
    });

    it("ArrowRight and ArrowLeft move along the bar, Home and End jump to its ends", async () => {
      render(<MegaMenu />);
      trigger("Women").focus();

      await userEvent.keyboard("{ArrowRight}");
      expect(trigger("Men")).toHaveFocus();
      await userEvent.keyboard("{ArrowRight}{ArrowRight}");
      expect(trigger("New")).toHaveFocus();
      await userEvent.keyboard("{ArrowRight}");
      expect(trigger("New")).toHaveFocus(); // төгсгөл: тойрохгүй
      await userEvent.keyboard("{Home}");
      expect(trigger("Women")).toHaveFocus();
      await userEvent.keyboard("{End}");
      expect(trigger("New")).toHaveFocus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(trigger("Kids")).toHaveFocus();
      // Bar дагуу хөдлөхөд өөрөө юу ч нээгдэхгүй.
      expect(flyout()).toHaveAttribute("data-open", "false");
    });

    it("with a flyout open, the arrows switch it along and it closes on an entry without one", async () => {
      render(<MegaMenu />);
      trigger("Women").focus();
      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() => expect(panel("Women").getAllByRole("link")[0]).toHaveFocus());
      trigger("Women").focus();

      await userEvent.keyboard("{ArrowRight}");
      expect(trigger("Men")).toHaveFocus();
      expect(expanded("Men")).toBe("true");
      expect(expanded("Women")).toBe("false");

      await userEvent.keyboard("{End}");
      expect(trigger("New")).toHaveFocus();
      expect(flyout()).toHaveAttribute("data-open", "false");
    });

    it("leaves the arrows alone inside the flyout", async () => {
      render(<MegaMenu />);
      trigger("Men").focus();
      await userEvent.keyboard("{ArrowDown}");
      const first = panel("Men").getAllByRole("link")[0]!;
      await waitFor(() => expect(first).toHaveFocus());

      await userEvent.keyboard("{ArrowRight}");

      expect(first).toHaveFocus();
      expect(expanded("Men")).toBe("true");
    });

    it("closes when focus leaves the menu", async () => {
      render(<MegaMenu />);
      trigger("Men").focus();
      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() => expect(expanded("Men")).toBe("true"));

      document.body.focus();
      fireEvent.blur(panel("Men").getAllByRole("link")[0]!, { relatedTarget: null });

      await waitFor(() => expect(expanded("Men")).toBe("false"));
    });
  });
});
