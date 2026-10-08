import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActiveFilters } from "./active-filters";
import { parseListingQuery } from "./parse-listing-query";
import { Pagination, pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("collapses distant pages into gaps", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(6, 20)).toEqual([1, "gap", 5, 6, 7, "gap", 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 19, 20]);
  });
});

describe("Pagination", () => {
  it("links keep the filters and mark the current page", () => {
    render(<Pagination query={parseListingQuery({ gender: "Men", page: "2" })} pages={5} />);
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute("href", "/products?gender=Men&page=3");
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/products?gender=Men");
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination query={parseListingQuery({})} pages={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ActiveFilters", () => {
  it("renders one removable chip per value, each linking to the URL without it", () => {
    render(<ActiveFilters query={parseListingQuery({ gender: ["Men", "Unisex"], color: "Blue", page: "4" })} />);
    const chips = screen.getAllByRole("link", { name: /Remove filter/ });
    expect(chips.map((c) => c.getAttribute("href"))).toEqual([
      "/products?gender=Unisex&color=Blue",
      "/products?gender=Men&color=Blue",
      "/products?gender=Men&gender=Unisex",
    ]);
    expect(screen.getByRole("link", { name: "Clear all" })).toHaveAttribute("href", "/products");
  });

  it("shows nothing when no filter is active", () => {
    const { container } = render(<ActiveFilters query={parseListingQuery({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});
