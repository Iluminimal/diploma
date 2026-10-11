import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { catalogNav } from "@/test/fixtures";
import { MegaMenu } from "./mega-menu";

let data: typeof catalogNav | undefined = catalogNav;
vi.mock("@/features/catalog/use-catalog-nav", () => ({ useCatalogNav: () => ({ data }) }));

const trigger = (name: string) => screen.getByRole("link", { name });
const panel = (name: string) => within(screen.getByRole("region", { name: `${name} categories`, hidden: true }));

describe("MegaMenu", () => {
  it("renders the departments as links before any data arrives", () => {
    data = undefined;
    render(<MegaMenu />);

    expect(trigger("Women")).toHaveAttribute("href", "/c/women");
    expect(trigger("Men")).toHaveAttribute("href", "/c/men");
    expect(trigger("Kids")).toHaveAttribute("href", "/c/kids");
    expect(trigger("New")).toHaveAttribute("href", "/products?sort=newest");
    expect(trigger("Men")).not.toHaveAttribute("aria-expanded");
    data = catalogNav;
  });

  it("opens a department's panel on hover and closes it when the pointer leaves", async () => {
    render(<MegaMenu />);
    expect(trigger("Men")).toHaveAttribute("aria-expanded", "false");

    await userEvent.hover(trigger("Men"));
    await waitFor(() => expect(trigger("Men")).toHaveAttribute("aria-expanded", "true"));
    expect(trigger("Women")).toHaveAttribute("aria-expanded", "false");
    expect(panel("Men").getByRole("link", { name: "Topwear" })).toHaveAttribute("href", "/c/men/apparel/topwear");

    await userEvent.unhover(trigger("Men"));
    await waitFor(() => expect(trigger("Men")).toHaveAttribute("aria-expanded", "false"));
  });

  it("lists popular article types", async () => {
    render(<MegaMenu />);
    await userEvent.hover(trigger("Men"));

    expect(panel("Men").getByRole("link", { name: "T-shirts" })).toHaveAttribute("href", "/c/men/apparel/topwear/tshirts");
  });

  it("ArrowDown moves into the panel and Escape returns to the department link", async () => {
    render(<MegaMenu />);
    trigger("Men").focus();

    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(trigger("Men")).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(panel("Men").getByRole("link", { name: "Clothing" })).toHaveFocus());

    await userEvent.keyboard("{Escape}");
    expect(trigger("Men")).toHaveAttribute("aria-expanded", "false");
    expect(trigger("Men")).toHaveFocus();
  });

  it("closes when focus leaves the department", async () => {
    render(<MegaMenu />);
    trigger("Men").focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(trigger("Men")).toHaveAttribute("aria-expanded", "true"));

    trigger("New").focus();

    await waitFor(() => expect(trigger("Men")).toHaveAttribute("aria-expanded", "false"));
  });
});
