import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetectedChip } from "./detected-chip";

const detected = [
  { article_type: "Shirts", category_path: "apparel/topwear/shirts", score: 0.62 },
  { article_type: "Tshirts", category_path: "apparel/topwear/tshirts", score: 0.21 },
];

describe("DetectedChip", () => {
  it("shows the top guess", () => {
    render(<DetectedChip detected={detected} value={null} allTypes={["Shirts", "Tshirts", "Jeans"]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Detected: Shirts/ })).toBeInTheDocument();
  });

  it("lets the user pick another detected category", async () => {
    const onChange = vi.fn();
    render(<DetectedChip detected={detected} value={null} allTypes={["Jeans"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Detected: Shirts/ }));
    expect(screen.getByText("62%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Tshirts/ }));
    expect(onChange).toHaveBeenCalledWith("Tshirts");
  });

  it("lets the user choose any category of the catalogue", async () => {
    const onChange = vi.fn();
    render(<DetectedChip detected={detected} value={null} allTypes={["Jeans", "Shirts"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Detected/ }));
    await userEvent.selectOptions(screen.getByLabelText("Another category"), "Jeans");
    expect(onChange).toHaveBeenCalledWith("Jeans");
  });

  it("shows the override and can go back to any category", async () => {
    const onChange = vi.fn();
    render(<DetectedChip detected={detected} value="Jeans" allTypes={["Jeans"]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Category: Jeans/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Category: Jeans/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Any category" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders nothing without a detection or an override", () => {
    const { container } = render(<DetectedChip detected={[]} value={null} allTypes={[]} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
