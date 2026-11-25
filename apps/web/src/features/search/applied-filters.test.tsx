import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { testIntl } from "@/test/intl";
import { AppliedFilters } from "./applied-filters";

describe("AppliedFilters", () => {
  it("renders nothing when no filter was recognised", () => {
    const { container } = render(<AppliedFilters applied={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists what the API understood from the words", () => {
    render(
      <AppliedFilters
        applied={[
          { key: "color", value: "Blue" },
          { key: "season", value: "Summer" },
          { key: "max_price", value: "17500000" },
          { key: "in_stock", value: "true" },
        ]}
      />,
    );

    expect(screen.getByText("Understood from your words")).toBeInTheDocument();
    expect(screen.getByText("Colour: Blue")).toBeInTheDocument();
    expect(screen.getByText("Season: Summer")).toBeInTheDocument();
    expect(screen.getByText("Up to ₮175,000")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });

  it("speaks Mongolian too", () => {
    testIntl.locale = "mn";
    render(<AppliedFilters applied={[{ key: "color", value: "Blue" }, { key: "gender", value: "Men" }]} />);

    expect(screen.getByText("Үгээс таньсан")).toBeInTheDocument();
    expect(screen.getByText(/Өнгө: /)).toBeInTheDocument();
    expect(screen.getByText(/Хүйс: /)).toBeInTheDocument();
  });
});
