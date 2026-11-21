import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegionOverlay, stackOrder } from "./region-overlay";

const region = (x: number, y: number, width: number, height: number) => ({
  box: { x, y, width, height },
  label: "top, t-shirt, sweatshirt",
  score: 0.9,
});

describe("stackOrder", () => {
  it("stacks smaller boxes above the ones that contain them", () => {
    // 0: бүтэн зураг, 1: дунд, 2: хамгийн жижиг
    expect(stackOrder([region(0, 0, 1, 1), region(0.2, 0.2, 0.6, 0.6), region(0.3, 0.3, 0.2, 0.2)])).toEqual([0, 1, 2]);
    expect(stackOrder([region(0.3, 0.3, 0.2, 0.2), region(0, 0, 1, 1)])).toEqual([1, 0]);
  });
});

describe("RegionOverlay", () => {
  const regions = [region(0, 0, 1, 0.5), region(0.1, 0.6, 0.5, 0.4)];

  it("frames each garment, covering exactly its box", () => {
    render(<RegionOverlay regions={regions} selected={-1} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "Search for garment 2" })).toHaveStyle({
      left: "10%",
      top: "60%",
      width: "50%",
      height: "40%",
    });
  });

  it("puts the smaller box on top so it can still be clicked", () => {
    render(<RegionOverlay regions={[region(0, 0, 1, 1), region(0.3, 0.3, 0.2, 0.2)]} selected={-1} onSelect={() => {}} />);

    const big = Number(screen.getByRole("button", { name: "Search for garment 1" }).style.zIndex);
    const small = Number(screen.getByRole("button", { name: "Search for garment 2" }).style.zIndex);

    expect(small).toBeGreaterThan(big);
  });

  it("marks the selected garment", () => {
    render(<RegionOverlay regions={regions} selected={1} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "Search for garment 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Search for garment 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reports which garment was clicked", async () => {
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
