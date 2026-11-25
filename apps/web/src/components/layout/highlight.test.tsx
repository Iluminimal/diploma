import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Highlight } from "./search-bar";

describe("Highlight", () => {
  it("marks the part that matches, whatever its case, and keeps the text the same", () => {
    const { container } = render(<Highlight text="Blue Denim Jacket" query="denim" />);

    expect(container.textContent).toBe("Blue Denim Jacket");
    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Denim"]);
  });

  it("marks every occurrence", () => {
    const { container } = render(<Highlight text="Red red RED" query="red" />);

    expect(container.querySelectorAll("mark")).toHaveLength(3);
  });

  it("takes special characters literally", () => {
    const { container } = render(<Highlight text="Men (slim) fit" query="(slim" />);

    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["(slim"]);
  });

  it("leaves the text alone when nothing matches or nothing was typed", () => {
    expect(render(<Highlight text="Jeans" query="shirt" />).container.querySelector("mark")).toBeNull();
    expect(render(<Highlight text="Jeans" query="  " />).container.querySelector("mark")).toBeNull();
  });
});
