import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardTilt } from "./card-tilt";

function stubMedia({ fine = true, reduce = false } = {}) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduce : fine,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

function box(element: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  element.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
}

function move(target: Element, clientX: number, clientY: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("CardTilt", () => {
  it("tilts the card under the pointer towards it, and lights the spot the pointer is on", () => {
    stubMedia();
    document.body.innerHTML = '<a data-tilt id="card"><span id="inner">x</span></a>';
    const card = document.getElementById("card")!;
    box(card, { left: 100, top: 100, width: 200, height: 300 });
    render(<CardTilt />);

    move(document.getElementById("inner")!, 275, 140); // баруун дээд хэсэг

    expect(card).toHaveAttribute("data-tilting");
    expect(card.style.getPropertyValue("--rx")).toBe("4.50deg");
    expect(card.style.getPropertyValue("--ry")).toBe("4.40deg");
    expect(card.style.getPropertyValue("--gx")).toBe("87.5%");
    expect(card.style.getPropertyValue("--gy")).toBe("13.3%");
  });

  it("lets a card go flat again when the pointer moves to something else", () => {
    stubMedia();
    document.body.innerHTML = '<a data-tilt id="card">x</a><p id="other">y</p>';
    const card = document.getElementById("card")!;
    box(card, { left: 0, top: 0, width: 100, height: 100 });
    render(<CardTilt />);
    move(card, 50, 50);

    move(document.getElementById("other")!, 400, 400);

    expect(card).not.toHaveAttribute("data-tilting");
    expect(card.style.getPropertyValue("--rx")).toBe("");
  });

  it("drops the tilt when the card is pressed, so the press animation is not fighting it", () => {
    stubMedia();
    document.body.innerHTML = '<a data-tilt id="card">x</a>';
    const card = document.getElementById("card")!;
    box(card, { left: 0, top: 0, width: 100, height: 100 });
    render(<CardTilt />);
    move(card, 50, 50);

    card.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    expect(card).not.toHaveAttribute("data-tilting");
  });

  it("pulls a magnetic button towards the pointer when it is near, by a few pixels at most, and lets go when it is far", () => {
    stubMedia();
    document.body.innerHTML = '<span data-magnetic id="cta">go</span><p id="far">far</p>';
    const cta = document.getElementById("cta")!;
    box(cta, { left: 100, top: 100, width: 100, height: 40 });
    render(<CardTilt />);

    move(document.body, 260, 120);
    expect(cta.style.getPropertyValue("--mx")).toBe("7.0px");
    expect(Math.abs(parseFloat(cta.style.getPropertyValue("--my")))).toBeLessThanOrEqual(7);

    move(document.body, 900, 700);
    expect(cta.style.getPropertyValue("--mx")).toBe("0px");
    expect(cta.style.getPropertyValue("--my")).toBe("0px");
  });

  it.each([
    ["a touch screen (no hover)", { fine: false }, "mouse"],
    ["someone who asked for less motion", { reduce: true }, "mouse"],
    ["a finger or pen on a mouse-capable screen", {}, "touch"],
  ])("does nothing for %s", (_label, media, pointerType) => {
    stubMedia(media);
    document.body.innerHTML = '<a data-tilt id="card">x</a>';
    const card = document.getElementById("card")!;
    box(card, { left: 0, top: 0, width: 100, height: 100 });
    render(<CardTilt />);

    move(card, 50, 50, pointerType);

    expect(card).not.toHaveAttribute("data-tilting");
  });

  it("stops listening when it goes away", () => {
    stubMedia();
    document.body.innerHTML = '<a data-tilt id="card">x</a>';
    const card = document.getElementById("card")!;
    box(card, { left: 0, top: 0, width: 100, height: 100 });
    const { unmount } = render(<CardTilt />);

    unmount();
    move(card, 50, 50);

    expect(card).not.toHaveAttribute("data-tilting");
  });
});
