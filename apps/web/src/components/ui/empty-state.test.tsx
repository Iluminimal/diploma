import { render, screen } from "@testing-library/react";
import { Heart } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("shows the title, the help and the way forward", () => {
    render(
      <EmptyState icon={Heart} title="Nothing saved yet" description="Tap the heart to keep it here.">
        <button type="button">Browse products</button>
      </EmptyState>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Nothing saved yet" })).toBeInTheDocument();
    expect(screen.getByText("Tap the heart to keep it here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse products" })).toBeInTheDocument();
  });

  it("can use a paragraph where the page has its own heading", () => {
    render(<EmptyState icon={Heart} as="p" title="Your cart is empty" />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
  });
});
