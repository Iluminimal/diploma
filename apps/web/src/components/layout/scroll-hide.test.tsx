import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScrollHide } from "./scroll-hide";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  window.dispatchEvent(new Event("scroll"));
}

afterEach(() => {
  scrollTo(0);
  delete document.documentElement.dataset.header;
});

describe("ScrollHide", () => {
  it("hides the header scrolling down, brings it back scrolling up and at the top", () => {
    render(<ScrollHide />);
    const state = () => document.documentElement.dataset.header;

    scrollTo(40);
    expect(state()).toBe("shown"); // within the first screenful
    scrollTo(200);
    expect(state()).toBe("hidden");
    scrollTo(204);
    expect(state()).toBe("hidden"); // a tiny wobble is not a direction
    scrollTo(150);
    expect(state()).toBe("shown");
    scrollTo(400);
    expect(state()).toBe("hidden");
    scrollTo(0);
    expect(state()).toBe("shown");
  });

  it("cleans up after itself", () => {
    const { unmount } = render(<ScrollHide />);
    scrollTo(300);
    expect(document.documentElement.dataset.header).toBe("hidden");

    unmount();

    expect(document.documentElement.dataset.header).toBeUndefined();
  });
});
