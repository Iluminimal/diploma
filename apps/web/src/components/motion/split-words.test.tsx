import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplitWords } from "./split-words";

describe("SplitWords", () => {
  it("wraps every word in a mask and numbers them in reading order", () => {
    const { container } = render(<h1><SplitWords>Shop by photo today</SplitWords></h1>);

    const words = [...container.querySelectorAll<HTMLElement>(".word")];
    expect(words.map((word) => word.textContent)).toEqual(["Shop", "by", "photo", "today"]);
    expect(words.map((word) => word.style.getPropertyValue("--w"))).toEqual(["0", "1", "2", "3"]);
    expect(container.querySelectorAll(".word-mask")).toHaveLength(4);
  });

  it("leaves the text exactly as it was, so the accessible name does not change", () => {
    render(<h1><SplitWords>Shop by photo.</SplitWords></h1>);

    expect(screen.getByRole("heading", { name: "Shop by photo." })).toBeInTheDocument();
    expect(screen.getByRole("heading").textContent).toBe("Shop by photo.");
  });

  it("splits inside an accent span too, and keeps counting across it", () => {
    const { container } = render(
      <h1>
        <SplitWords>
          {["Shop ", <span key="g" className="text-gradient">by photo.</span>]}
        </SplitWords>
      </h1>,
    );

    expect(container.querySelector(".text-gradient")?.querySelectorAll(".word")).toHaveLength(2);
    expect([...container.querySelectorAll<HTMLElement>(".word")].map((w) => w.style.getPropertyValue("--w"))).toEqual(["0", "1", "2"]);
    expect(container.textContent).toBe("Shop by photo.");
  });

  it("leaves whitespace and empty content alone", () => {
    const { container } = render(<p><SplitWords>{"  "}</SplitWords></p>);

    expect(container.querySelectorAll(".word")).toHaveLength(0);
  });
});
