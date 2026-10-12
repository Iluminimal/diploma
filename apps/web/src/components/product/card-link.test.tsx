import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardLink } from "./card-link";

function Page() {
  return (
    <>
      <div data-fly-source style={{ viewTransitionName: "product-hero" }} data-testid="hero" />
      <CardLink href="/products/1/a" data-testid="a">
        <div data-card-photo data-testid="photo-a" />
      </CardLink>
      <CardLink href="/products/2/b" data-testid="b">
        <div data-card-photo data-testid="photo-b" />
      </CardLink>
    </>
  );
}

describe("CardLink", () => {
  it("names only the clicked card's photo and takes the name from the page's own hero", () => {
    render(<Page />);

    fireEvent.click(screen.getByTestId("a"), { button: 0 });

    expect(screen.getByTestId("photo-a").style.viewTransitionName).toBe("product-hero");
    expect(screen.getByTestId("photo-b").style.viewTransitionName).toBe("");
    expect(screen.getByTestId("hero").style.viewTransitionName).toBe("none");
  });

  it("leaves a new-tab click alone", () => {
    render(<Page />);

    fireEvent.click(screen.getByTestId("a"), { button: 0, metaKey: true });

    expect(screen.getByTestId("photo-a").style.viewTransitionName).toBe("");
  });
});
