import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordView } from "@/features/catalog/recently-viewed";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { Departments } from "./departments";
import { Hero } from "./hero";
import { PhotoTile } from "./photo-tile";
import { RecentlyViewed } from "./recently-viewed";
import { NewArrivals } from "./shelves";

vi.mock("server-only", () => ({}));
const newest = vi.fn();
vi.mock("./home-data", () => ({ newest: (...args: unknown[]) => newest(...args) }));
vi.mock("@/features/search/photo-search-trigger", () => ({
  PhotoSearchTrigger: ({ label = "Search with a photo" }: { label?: string }) => <button type="button">{label}</button>,
}));

beforeEach(() => {
  newest.mockReset();
  window.localStorage.clear();
});

describe("Hero", () => {
  it("leads with the headline and two ways in, even when the catalogue cannot be reached", async () => {
    newest.mockResolvedValue([]);

    render(await Hero());

    expect(screen.getByRole("heading", { level: 1, name: "Shop by photo." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search with a photo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop new arrivals" })).toHaveAttribute("href", "/products?sort=newest");
  });

  it("shows three real products under it, hidden from assistive technology", async () => {
    newest.mockImplementation(async (patch: { category: string }) => [makeProduct({ id: patch.category === "footwear" ? 1 : 2 })]);

    const { container } = render(await Hero());

    expect(container.querySelectorAll("img")).toHaveLength(3);
    expect(container.querySelector("img")?.closest("[aria-hidden]")).not.toBeNull();
  });

  it("never animates its headline (it is what the page is measured on), only lets the photos rise", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1 })]);

    const { container } = render(await Hero());

    expect(screen.getByRole("heading", { level: 1 }).closest(".tile-copy")).toBeNull();
    expect(container.querySelectorAll(".photo-rise").length).toBeGreaterThan(0);
  });
});

describe("Departments", () => {
  it("has a tile and a way in for Women, Men and Kids", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1 }), makeProduct({ id: 2 })]);

    render(await Departments());

    for (const [name, href] of [["Women", "/c/women"], ["Men", "/c/men"], ["Kids", "/c/kids"]] as const) {
      const tile = screen.getByRole("region", { name });
      expect(within(tile).getByRole("heading", { name })).toBeInTheDocument();
      expect(within(tile).getByRole("link", { name: `Shop ${name.toLowerCase()}` })).toHaveAttribute("href", href);
    }
  });

  it("lets the words and the photo of each tile settle in as it scrolls into view", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1 }), makeProduct({ id: 2 })]);

    const { container } = render(await Departments());

    expect(container.querySelectorAll(".tile-copy")).toHaveLength(3);
    expect(container.querySelectorAll(".tile-photo")).toHaveLength(3);
  });

  it("still shows the tiles when no product can be fetched", async () => {
    newest.mockResolvedValue([]);

    render(await Departments());

    expect(screen.getAllByRole("link", { name: /^Shop / })).toHaveLength(3);
  });
});

describe("PhotoTile", () => {
  it("offers the photo search, with a button to try it", () => {
    render(<PhotoTile />);

    expect(screen.getByRole("heading", { name: "From a photo to your Bag." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try it" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open photo search" })).toHaveAttribute("href", "/search");
  });
});

describe("NewArrivals", () => {
  it("is one shelf of the newest products with a link to all of them", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1, name: "Blue Kurta" })]);

    renderWithQuery((await NewArrivals())!);

    expect(screen.getByRole("link", { name: "Shop all" })).toHaveAttribute("href", "/products?sort=newest");
    expect(screen.getByText("Blue Kurta")).toBeInTheDocument();
  });

  it("is absent when there is nothing to show", async () => {
    newest.mockResolvedValue([]);

    expect(await NewArrivals()).toBeNull();
  });
});

describe("RecentlyViewed", () => {
  it("shows nothing to a first-time visitor", () => {
    const { container } = render(<RecentlyViewed />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows what this browser looked at, newest first, and updates when another page records one", async () => {
    recordView(makeProduct({ id: 1, name: "First look", slug: "first" }));
    renderWithQuery(<RecentlyViewed />);
    expect(await screen.findByRole("heading", { name: "Recently viewed" })).toBeInTheDocument();

    recordView(makeProduct({ id: 2, name: "Second look", slug: "second" }));

    const rail = screen.getByRole("list", { name: "Recently viewed" });
    expect(await within(rail).findByText("Second look")).toBeInTheDocument();
    expect(within(rail).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Second look", "First look"]);
    expect(within(rail).getByRole("link", { name: /Second look/ })).toHaveAttribute("href", "/products/2/second");
  });
});
