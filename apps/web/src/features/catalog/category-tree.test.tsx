import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { catalogNav } from "@/test/fixtures";
import { CategoryTree } from "./category-tree";
import { findTrail } from "./nav";

const tree = (...segments: string[]) => {
  render(<CategoryTree trail={findTrail(catalogNav, "men", segments)!} />);
  return within(screen.getByRole("navigation", { name: "Categories" }));
};

describe("CategoryTree", () => {
  it("starts at the department, with the groups below it", () => {
    const nav = tree();

    expect(nav.getByRole("link", { name: "All Men" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: /Clothing/ })).toHaveAttribute("href", "/c/men/apparel");
    expect(nav.getByText("300")).toBeInTheDocument();
  });

  it("shows the way back up and the next level down with counts", () => {
    const nav = tree("apparel", "topwear");

    expect(nav.getByRole("link", { name: "All Men" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Clothing" })).toHaveAttribute("href", "/c/men/apparel");
    expect(nav.getByRole("link", { name: "Topwear" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: /T-shirts/ })).toHaveTextContent("200");
    expect(nav.getByRole("link", { name: /^Shirts/ })).toHaveAttribute("href", "/c/men/apparel/topwear/shirts");
  });

  it("lists the siblings of a leaf and marks the leaf current", () => {
    const nav = tree("apparel", "topwear", "tshirts");

    expect(nav.getByRole("link", { name: /T-shirts/ })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: /^Shirts/ })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Topwear" })).not.toHaveAttribute("aria-current");
  });
});
