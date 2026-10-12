import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RatingInput } from "./rating-input";

function Harness({ initial = 0, error }: { initial?: number; error?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RatingInput value={value} onChange={setValue} error={error} />
      <output>{value}</output>
    </>
  );
}

describe("RatingInput", () => {
  it("is a group of five radio buttons with words for each", () => {
    render(<Harness />);

    expect(screen.getByRole("group", { name: "Your rating" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios[0]).toHaveAccessibleName("1 star, Poor");
    expect(radios[4]).toHaveAccessibleName("5 stars, Excellent");
    expect(radios.some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  });

  it("chooses the star clicked", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("radio", { name: "4 stars, Very good" }));

    expect(screen.getByRole("radio", { name: "4 stars, Very good" })).toBeChecked();
    expect(screen.getByText("4", { selector: "output" })).toBeInTheDocument();
  });

  it("can be changed with the arrow keys", async () => {
    render(<Harness initial={3} />);

    screen.getByRole("radio", { name: "3 stars, Good" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "4 stars, Very good" })).toBeChecked();
  });

  it("shows what is wrong", () => {
    render(<Harness error="Choose a rating" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a rating");
    expect(screen.getByRole("group")).toHaveAttribute("aria-describedby", "rating-error");
  });
});
