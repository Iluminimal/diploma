import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarList } from "./bar-list";
import { Sparkline } from "./sparkline";

describe("Sparkline", () => {
  it("draws a decorative line through the values", () => {
    const { container } = render(<Sparkline values={[1, 5, 3, 8]} />);

    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M0 /);
  });

  it.each([[[]], [[4]], [[0, 0, 0]]])("draws nothing for %j (a flat line would mislead)", (values) => {
    const { container } = render(<Sparkline values={values} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("BarList", () => {
  const bars = [
    { key: "a", label: "Apparel", value: 90, display: "$90" },
    { key: "b", label: "Footwear", value: 45, display: "$45", hint: "33%" },
    { key: "c", label: "Empty", value: 0, display: "$0" },
  ];

  it("scales each bar against the largest and keeps the figures as text", () => {
    const { container, getByRole } = render(<BarList label="Sales" bars={bars} />);

    const widths = [...container.querySelectorAll<HTMLElement>("[style]")].map((el) => el.style.width);
    expect(widths).toEqual(["100%", "50%", "0%"]);
    expect(getByRole("list", { name: "Sales" })).toHaveTextContent("Footwear$4533%");
  });

  it("gives a tiny non-zero value a visible sliver", () => {
    const { container } = render(
      <BarList label="x" bars={[{ key: "a", label: "A", value: 1000, display: "1000" }, { key: "b", label: "B", value: 1, display: "1" }]} />,
    );

    expect(container.querySelectorAll<HTMLElement>("[style]")[1]?.style.width).toBe("2%");
  });
});
