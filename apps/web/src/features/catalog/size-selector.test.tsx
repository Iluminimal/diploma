import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SizeSelector } from "./size-selector";

describe("SizeSelector", () => {
  it("starts with no size and announces the chosen one", async () => {
    render(<SizeSelector label="Size" sizes={["S", "M", "L"]} />);
    expect(screen.getByText("Select a size")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("M"));
    expect(screen.getByLabelText("M")).toBeChecked();
    expect(screen.getByText("Selected: M")).toBeInTheDocument();
  });

  it("is keyboard operable as a radio group", async () => {
    render(<SizeSelector label="Size" sizes={["S", "M"]} />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("M")).toBeChecked();
  });

  it("cannot be used when the product is sold out", () => {
    render(<SizeSelector label="Size" sizes={["S", "M"]} disabled />);
    expect(screen.getByLabelText("S")).toBeDisabled();
  });
});
