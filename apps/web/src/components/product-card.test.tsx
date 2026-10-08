import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "@/test/render";
import { makeProduct } from "@/test/fixtures";
import { ProductCard } from "./product-card";

describe("ProductCard", () => {
  it("links to the canonical product page and shows name, subtitle and price", () => {
    renderWithQuery(<ProductCard product={makeProduct()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/products/41885/alma-women-blue-kurta-60000");
    expect(screen.getByRole("heading", { name: "Alma Women Blue Kurta" })).toBeInTheDocument();
    expect(screen.getByText("Blue · Kurtas")).toBeInTheDocument();
    expect(screen.getByText("$34.99")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Alma Women Blue Kurta" })).toBeInTheDocument();
  });

  it("flags sold-out products", () => {
    renderWithQuery(<ProductCard product={makeProduct({ in_stock: false })} />);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
  });

  it("renders a badge overlay", () => {
    renderWithQuery(<ProductCard product={makeProduct()} badge={<span>92% match</span>} />);
    expect(screen.getByText("92% match")).toBeInTheDocument();
  });
});
