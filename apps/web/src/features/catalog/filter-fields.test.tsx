import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { filterOptions } from "@/test/fixtures";
import { FilterFields } from "./filter-fields";
import { emptyFilters } from "./filters";

function setup(value = emptyFilters()) {
  const onChange = vi.fn();
  render(<FilterFields options={filterOptions} value={value} onChange={onChange} />);
  return onChange;
}

describe("FilterFields", () => {
  it("toggles a gender", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Women" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ gender: ["Women"] }));
  });

  it("removes a gender that is already selected", async () => {
    const onChange = setup({ ...emptyFilters(), gender: ["Women", "Men"] });
    await userEvent.click(screen.getByRole("checkbox", { name: "Women" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ gender: ["Men"] }));
  });

  it("offers colour swatches as pressed-state buttons and hides the NA colour", async () => {
    const onChange = setup({ ...emptyFilters(), color: ["Blue"] });
    const colours = within(screen.getByRole("list", { name: "Colour" }));
    expect(colours.getByRole("button", { name: "Blue" })).toHaveAttribute("aria-pressed", "true");
    expect(colours.queryByRole("button", { name: "NA" })).not.toBeInTheDocument();
    await userEvent.click(colours.getByRole("button", { name: "Black" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: ["Blue", "Black"] }));
  });

  it("filters to in-stock items", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "In stock only" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ in_stock: true }));
  });

  it("selects categories at article-type level, opening the branch that holds a selection", async () => {
    const onChange = setup({ ...emptyFilters(), article_type: ["Shirts"] });
    expect(screen.getByRole("checkbox", { name: "Shirts" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Tshirts" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ article_type: ["Shirts", "Tshirts"] }));
  });

  it("shows only the requested groups", () => {
    render(<FilterFields options={filterOptions} value={emptyFilters()} onChange={() => {}} showCategories={false} groups={["color"]} />);
    expect(screen.queryByText("Gender")).not.toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
    expect(screen.getByText("Colour")).toBeInTheDocument();
  });
});
