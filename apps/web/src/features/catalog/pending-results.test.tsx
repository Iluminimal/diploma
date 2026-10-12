import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { useListingPending } from "./listing-pending";
import { PendingResults } from "./pending-results";

describe("PendingResults", () => {
  it("keeps showing the grid, dimmed and inert, while a filter change is on its way", () => {
    render(
      <PendingResults>
        <p>Blue Kurta</p>
      </PendingResults>,
    );
    const wrapper = screen.getByText("Blue Kurta").parentElement!;
    expect(wrapper).not.toHaveAttribute("aria-busy", "true");

    act(() => useListingPending.getState().setPending(true));
    expect(screen.getByText("Blue Kurta")).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("aria-busy", "true");
    expect(wrapper).toHaveClass("opacity-50", "pointer-events-none");

    act(() => useListingPending.getState().setPending(false));
    expect(wrapper).not.toHaveClass("opacity-50");
  });
});
