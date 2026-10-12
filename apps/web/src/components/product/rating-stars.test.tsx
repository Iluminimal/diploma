import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RatingStars, ratingLabel } from "./rating-stars";

describe("ratingLabel", () => {
  it.each([
    [5, "5 out of 5 stars"],
    [4, "4 out of 5 stars"],
    [4.5, "4.5 out of 5 stars"],
    [3.75, "3.8 out of 5 stars"],
    [0, "0 out of 5 stars"],
  ])("writes %s as %s", (rating, label) => {
    expect(ratingLabel(rating)).toBe(label);
  });
});

describe("RatingStars", () => {
  it("is an image with the rating in words", () => {
    render(<RatingStars rating={4.5} />);

    expect(screen.getByRole("img", { name: "4.5 out of 5 stars" })).toBeInTheDocument();
  });

  it("fills the stars to the rating", () => {
    const { container } = render(<RatingStars rating={3} />);

    const filled = container.querySelector<HTMLElement>("span[style]");
    expect(filled?.style.width).toBe("60%");
  });

  it("stays within zero and five", () => {
    render(<RatingStars rating={9} />);
    expect(screen.getByRole("img", { name: "5 out of 5 stars" })).toBeInTheDocument();
  });
});
