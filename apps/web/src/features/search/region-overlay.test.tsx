import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { dotPositions, RegionOverlay } from "./region-overlay";

const region = (x: number, y: number, width: number, height: number) => ({
  box: { x, y, width, height },
  label: "top, t-shirt, sweatshirt",
  score: 0.9,
});

describe("dotPositions", () => {
  it("places each dot at the centre of its box", () => {
    expect(dotPositions([region(0, 0, 1, 0.5), region(0.1, 0.6, 0.5, 0.4)])).toEqual([
      { x: 0.5, y: 0.25 },
      { x: 0.35, y: 0.8 },
    ]);
  });

  it("moves a dot that would sit on top of an earlier one", () => {
    const [first, second, third] = dotPositions([region(0, 0, 1, 1), region(0.2, 0.2, 0.6, 0.6), region(0.3, 0.3, 0.4, 0.4)]);

    expect(first).toEqual({ x: 0.5, y: 0.5 });
    expect(second!.x).toBe(0.5);
    expect(second!.y).toBeGreaterThan(0.5);
    for (const [a, b] of [[first, second], [first, third], [second, third]] as const) {
      expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("keeps nudged dots inside the photo", () => {
    const dots = dotPositions([region(0, 0.8, 1, 0.2), region(0, 0.8, 1, 0.2), region(0, 0.8, 1, 0.2)]);

    expect(Math.max(...dots.map((d) => d.y))).toBeLessThanOrEqual(0.95);
  });
});

describe("RegionOverlay", () => {
  const regions = [region(0, 0, 1, 0.5), region(0.1, 0.6, 0.5, 0.4)];

  it("renders one numbered dot per garment and marks the selected one", () => {
    render(<RegionOverlay regions={regions} selected={1} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "Search for garment 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Search for garment 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reports which dot was clicked", async () => {
    const onSelect = vi.fn();
    render(<RegionOverlay regions={regions} selected={-1} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: "Search for garment 2" }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("draws nothing when there is no choice to make", () => {
    const { container } = render(<RegionOverlay regions={[regions[0]!]} selected={0} onSelect={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });
});
