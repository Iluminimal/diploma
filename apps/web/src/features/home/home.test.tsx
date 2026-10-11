import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordView } from "@/features/catalog/recently-viewed";
import { catalogNav, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { PromoStrip } from "./promo-strip";
import { RecentlyViewed } from "./recently-viewed";
import { CategoryPills } from "./shelves";
import { TrustStrip } from "./trust-strip";

vi.mock("server-only", () => ({}));
const newest = vi.fn();
vi.mock("./home-data", () => ({ newest: (...args: unknown[]) => newest(...args) }));
const getSimilarProducts = vi.fn();
const getCatalogNav = vi.fn();
vi.mock("@/features/catalog/api", () => ({
  getSimilarProducts: (...args: unknown[]) => getSimilarProducts(...args),
  getCatalogNav: () => getCatalogNav(),
}));
vi.mock("@/features/search/photo-search-trigger", () => ({
  PhotoSearchTrigger: () => <button type="button">Search with a photo</button>,
}));

beforeEach(() => {
  newest.mockReset();
  getSimilarProducts.mockReset();
  getCatalogNav.mockReset();
  window.localStorage.clear();
});

describe("PromoStrip", () => {
  it("states the real shipping offer and points at photo search", () => {
    render(<PromoStrip />);

    expect(screen.getByText(/Free standard shipping on orders over \$100/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search any look with a photo" })).toHaveAttribute("href", "/search");
  });
});

describe("Hero", () => {
  it("leads with the headline and three ways in, even when the catalogue cannot be reached", async () => {
    newest.mockResolvedValue([]);

    render(await Hero());

    expect(screen.getByRole("heading", { level: 1, name: "Shop by photo." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search with a photo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop women" })).toHaveAttribute("href", "/c/women");
    expect(screen.getByRole("link", { name: "Shop men" })).toHaveAttribute("href", "/c/men");
    expect(document.querySelectorAll(".drift")).toHaveLength(0);
  });

  it("shows a drifting collage of real products, hidden from assistive technology", async () => {
    newest.mockImplementation(async (patch: { category: string }) => [makeProduct({ id: patch.category === "footwear" ? 1 : 2 })]);

    const { container } = render(await Hero());

    expect(container.querySelectorAll(".drift")).toHaveLength(5);
    expect(container.querySelector(".drift")?.closest("[aria-hidden]")).not.toBeNull();
  });
});

describe("HowItWorks", () => {
  it("renders nothing when there is no product to demonstrate", async () => {
    newest.mockResolvedValue([]);

    expect(await HowItWorks()).toBeNull();
  });

  it("tells the three steps with a real photo, what was detected and its nearest matches", async () => {
    newest.mockResolvedValue([makeProduct({ id: 10, name: "Navy Shirt", article_type: "Shirts", base_colour: "Navy Blue", gender: "Men" })]);
    getSimilarProducts.mockResolvedValue({
      results: [11, 12, 13].map((id) => ({ similarity: 0.9, product: makeProduct({ id, slug: `match-${id}`, name: `Match ${id}` }) })),
    });

    render(await HowItWorks());

    expect(screen.getByRole("heading", { level: 2, name: /From a photo to your cart/ })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Snap or upload", "We look", "Find it"]);
    const detected = within(screen.getByRole("list", { name: "What we detected" }));
    expect(detected.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Shirts", "Navy Blue", "Men"]);
    const matches = within(screen.getByRole("list", { name: "Matching products" })).getAllByRole("link");
    expect(matches.map((a) => a.getAttribute("href"))).toEqual(["/products/11/match-11", "/products/12/match-12", "/products/13/match-13"]);
  });

  it("is not shown when the model has no neighbours for it", async () => {
    newest.mockResolvedValue([makeProduct()]);
    getSimilarProducts.mockResolvedValue({ results: [] });

    expect(await HowItWorks()).toBeNull();
  });
});

describe("CategoryPills", () => {
  it("links the biggest categories of Women and Men, once per name, biggest first", async () => {
    getCatalogNav.mockResolvedValue(catalogNav);

    render(await CategoryPills());

    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/c/men/apparel/topwear/tshirts",
      "/c/men/apparel/topwear/shirts",
    ]);
    expect(links[0]).toHaveTextContent("T-shirts");
    expect(links[0]).toHaveTextContent("Men");
  });

  it("is absent when the menu data cannot be loaded", async () => {
    getCatalogNav.mockRejectedValue(new Error("down"));

    expect(await CategoryPills()).toBeNull();
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

describe("TrustStrip", () => {
  it("says only true things", () => {
    render(<TrustStrip />);

    expect(screen.getByText("Free shipping over $100")).toBeInTheDocument();
    expect(screen.getByText(/never stored/)).toBeInTheDocument();
    expect(screen.getByText(/test payments/)).toBeInTheDocument();
  });
});
