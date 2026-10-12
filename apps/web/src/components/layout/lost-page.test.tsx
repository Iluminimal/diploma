import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";

describe("the 404 page", () => {
  it("says what happened and offers a search and the way back into the shop", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "We couldn't find that page" })).toBeInTheDocument();
    const search = screen.getByRole("search");
    expect(search).toHaveAttribute("action", "/products");
    expect(screen.getByRole("searchbox", { name: "Search the shop" })).toHaveAttribute("name", "q");
    const places = screen.getByRole("navigation", { name: "Popular places" });
    expect(places).toHaveTextContent("Women");
    expect(screen.getByRole("link", { name: "Men" })).toHaveAttribute("href", "/c/men");
    expect(screen.getByRole("link", { name: "New arrivals" })).toHaveAttribute("href", "/products?sort=newest");
    expect(screen.getByRole("link", { name: "Search by photo" })).toHaveAttribute("href", "/search");
  });
});
