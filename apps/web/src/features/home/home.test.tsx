import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordView } from "@/features/catalog/recently-viewed";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { Departments } from "./departments";
import { Hero } from "./hero";
import { PhotoTile } from "./photo-tile";
import { RecentlyViewed } from "./recently-viewed";
import { NewArrivals, PopularNow } from "./shelves";

vi.mock("server-only", () => ({}));
const newest = vi.fn();
const popular = vi.fn();
vi.mock("./home-data", () => ({
  newest: (...args: unknown[]) => newest(...args),
  popular: (...args: unknown[]) => popular(...args),
}));
vi.mock("@/features/search/photo-search-trigger", () => ({
  PhotoSearchTrigger: ({ label = "Search with a photo" }: { label?: string }) => <button type="button">{label}</button>,
}));

beforeEach(() => {
  newest.mockReset();
  popular.mockReset();
  window.localStorage.clear();
});

describe("Hero", () => {
  it("leads with the headline and two ways in, even when the catalogue cannot be reached", async () => {
    newest.mockResolvedValue([]);

    render(await Hero());

    expect(screen.getByRole("heading", { level: 1, name: "Shop by photo." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search with a photo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New arrivals" })).toHaveAttribute("href", "/products?sort=newest");
  });

  it("says very little: an eyebrow, the headline and the buttons, no paragraph", async () => {
    newest.mockResolvedValue([]);

    const { container } = render(await Hero());

    expect(container.querySelector("p:not(.gh-eyebrow)")).toBeNull();
  });

  it("shows three real products in a framed demo card, hidden from assistive technology, with the middle one scanned", async () => {
    newest.mockImplementation(async (patch: { category: string }) => [makeProduct({ id: patch.category === "footwear" ? 1 : 2 })]);

    const { container } = render(await Hero());

    expect(container.querySelectorAll("img")).toHaveLength(3);
    expect(container.querySelector("img")?.closest("[aria-hidden]")).not.toBeNull();
    expect(container.querySelector(".gh-frame")).not.toBeNull();
    expect(container.querySelectorAll(".animate-scan")).toHaveLength(1);
  });

  it("opens word by word without ever hiding the headline, and keeps the sentence intact", async () => {
    newest.mockResolvedValue([]);

    const { container } = render(await Hero());

    const heading = screen.getByRole("heading", { level: 1 });
    expect([...heading.querySelectorAll(".word")].map((word) => word.textContent)).toEqual(["Shop", "by", "photo."]);
    expect(heading.textContent).toBe("Shop by photo.");
    expect(heading).not.toHaveClass("hero-rise");
    // Шошго, товчнууд, demo зөөлөн өргөгдөнө; гарчиг нь зөвхөн үгээр гарна.
    expect(container.querySelectorAll(".hero-rise").length).toBeGreaterThanOrEqual(2);
  });

  it("puts the headline in a glow with one accent word, without hiding any of it", async () => {
    newest.mockResolvedValue([]);

    const { container } = render(await Hero());

    expect(container.querySelector(".gh-glow")).not.toBeNull();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.querySelector(".text-gradient")?.textContent).toBe("by photo.");
    expect(heading.textContent).toBe("Shop by photo.");
  });
});

describe("Departments", () => {
  it("has a card and a way in for Women, Men and Kids, named by the department", async () => {
    popular.mockResolvedValue([makeProduct({ id: 1 }), makeProduct({ id: 2 })]);

    render(await Departments());

    for (const [name, href] of [["Women", "/c/women"], ["Men", "/c/men"], ["Kids", "/c/kids"]] as const) {
      const card = screen.getByRole("link", { name });
      expect(card).toHaveAttribute("href", href);
      expect(within(card).getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("is one link per card (the whole card is the target), so there is one tab stop each", async () => {
    popular.mockResolvedValue([makeProduct({ id: 1 }), makeProduct({ id: 2 })]);

    render(await Departments());

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("lets each card rise in turn as it scrolls into view, with its photo settling, all in CSS", async () => {
    popular.mockResolvedValue([makeProduct({ id: 1 }), makeProduct({ id: 2 })]);

    const { container } = render(await Departments());

    const cards = [...container.querySelectorAll("a")];
    expect(cards).toHaveLength(3);
    for (const [index, card] of cards.entries()) {
      expect(card).toHaveClass("view-rise", "tile", "zoom-on-hover");
      expect(card.style.getPropertyValue("--i")).toBe(String(index));
    }
    expect(container.querySelectorAll(".reveal-scale")).toHaveLength(3);
  });

  it("hides the decorative photos and the colour dots from assistive technology", async () => {
    popular.mockResolvedValue([makeProduct({ id: 1 }), makeProduct({ id: 2 })]);

    const { container } = render(await Departments());

    expect(container.querySelectorAll("img:not([aria-hidden])")).toHaveLength(0);
    expect(container.querySelectorAll("a > div > span[aria-hidden], a span[aria-hidden]").length).toBeGreaterThanOrEqual(3);
  });

  it("takes each card's photo from the popular pieces in that department", async () => {
    popular.mockResolvedValue([makeProduct({ id: 1 })]);

    await Departments();

    expect(popular).toHaveBeenCalledWith({ department: "women", category: "apparel" }, 2);
    expect(popular).toHaveBeenCalledWith({ department: "men", category: "apparel" }, 2);
    expect(popular).toHaveBeenCalledWith({ department: "kids", category: "apparel" }, 2);
  });

  it("still shows the cards when no product can be fetched", async () => {
    popular.mockResolvedValue([]);

    render(await Departments());

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});

describe("PhotoTile", () => {
  it("offers the photo search, with a button to try it", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1 })]);

    render(await PhotoTile());

    expect(screen.getByRole("heading", { name: "From photo to Bag." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try it" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open photo search" })).toHaveAttribute("href", "/search");
  });

  it("explains the three steps, in order, each one revealed as it scrolls into view", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1 })]);

    const { container } = render(await PhotoTile());

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    // Дугаар (aria-hidden) нь текстэд орно, нэр нь богино нэг мөр.
    expect(steps.map((step) => step.textContent)).toEqual(["01Upload a photo", "02We find the match", "03Add to Bag"]);
    // Алхам бүр өөрийн scroll-driven animation-тай (`story-step-1..3`).
    for (const step of [1, 2, 3]) expect(container.querySelector(`.story-step-${step}`)).not.toBeNull();
  });

  it("finds three similar pieces after the scan, hidden from assistive technology like the rest of the picture", async () => {
    newest.mockResolvedValue([1, 2, 3, 4, 5, 6].map((id) => makeProduct({ id })));

    const { container } = render(await PhotoTile());

    const matches = container.querySelectorAll(".story-match");
    expect(matches).toHaveLength(3);
    expect(matches[0]?.closest("[aria-hidden]")).not.toBeNull();
    // Heading words open in turn, like the hero's.
    expect(container.querySelectorAll("h2 .word").length).toBeGreaterThan(3);
  });

  it("shows a scanned example photo that assistive technology skips, and still works without one", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1 })]);
    const withPhoto = render(await PhotoTile());
    expect(withPhoto.container.querySelector("img")?.closest("[aria-hidden]")).not.toBeNull();
    expect(withPhoto.container.querySelector(".story-scan")).not.toBeNull();
    expect(withPhoto.container.querySelectorAll(".story-detect").length).toBeGreaterThan(0);
    withPhoto.unmount();

    newest.mockResolvedValue([]);
    const without = render(await PhotoTile());
    expect(without.container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Try it" })).toBeInTheDocument();
  });
});

describe("NewArrivals", () => {
  it("is one shelf of the newest products with a link to all of them", async () => {
    newest.mockResolvedValue([makeProduct({ id: 1, name: "Blue Kurta" })]);

    renderWithQuery((await NewArrivals())!);

    expect(screen.getByRole("link", { name: "Shop all →" })).toHaveAttribute("href", "/products?sort=newest");
    expect(screen.getByText("Blue Kurta")).toBeInTheDocument();
  });

  it("is absent when there is nothing to show", async () => {
    newest.mockResolvedValue([]);

    expect(await NewArrivals()).toBeNull();
  });
});

describe("PopularNow", () => {
  it("is one shelf of the most popular products with a link to all of them", async () => {
    popular.mockResolvedValue([makeProduct({ id: 1, name: "Bestseller" })]);

    renderWithQuery((await PopularNow())!);

    expect(screen.getByRole("heading", { name: "Popular" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop all →" })).toHaveAttribute("href", "/products?sort=popular");
    expect(screen.getByText("Bestseller")).toBeInTheDocument();
  });

  it("is absent when there is nothing to show", async () => {
    popular.mockResolvedValue([]);

    expect(await PopularNow()).toBeNull();
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
