import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./reveal";
import { ScrollFade } from "./scroll-fade";

afterEach(() => vi.unstubAllGlobals());

function stubObserver() {
  let notify: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  return { enter: () => notify([{ isIntersecting: true }]), disconnect };
}

describe("Reveal", () => {
  it("is marked for the reveal styles and shown once it scrolls into view, then stops watching", () => {
    const observer = stubObserver();
    render(<Reveal delay={0.2}>Hello</Reveal>);
    const element = screen.getByText("Hello");

    expect(element).toHaveAttribute("data-reveal");
    expect(element).not.toHaveAttribute("data-in");
    expect(element.style.getPropertyValue("--reveal-delay")).toBe("0.2s");

    act(() => observer.enter());

    expect(element).toHaveAttribute("data-in");
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("shows itself right away when asked to reveal on mount", async () => {
    stubObserver();
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      callback();
      return 0;
    });
    render(<Reveal when="mount">Now</Reveal>);

    expect(screen.getByText("Now")).toHaveAttribute("data-in");
  });

  it("can be a list item, to sit inside a list", () => {
    render(
      <ul>
        <Reveal as="li">One</Reveal>
      </ul>,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("One");
  });
});

describe("ScrollFade", () => {
  it("renders its children in a wrapper the scroll styles apply to", () => {
    render(
      <ScrollFade>
        <h1>Headline</h1>
      </ScrollFade>,
    );

    expect(screen.getByRole("heading", { name: "Headline" }).parentElement).toHaveClass("scroll-fade");
  });
});
