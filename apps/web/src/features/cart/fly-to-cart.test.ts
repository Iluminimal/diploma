import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flyToCart } from "./fly-to-cart";

const rect = (left: number, top: number, size = 100) =>
  ({ left, top, width: size, height: size, right: left + size, bottom: top + size, x: left, y: top, toJSON() {} }) as DOMRect;

function place(element: Element, box: DOMRect) {
  element.getBoundingClientRect = () => box;
}

let animations: { element: Element; finish: () => void }[] = [];

beforeEach(() => {
  document.body.innerHTML = '<button data-cart-button></button><div id="photo"></div><button id="add"></button>';
  animations = [];
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  // jsdom-д Web Animations байхгүй: тест хэлэхэд `finished` нь resolve болдог stub.
  Element.prototype.animate = function (this: Element) {
    let done: () => void = () => {};
    const finished = new Promise<void>((resolve) => (done = resolve));
    animations.push({ element: this, finish: done });
    return { finished } as unknown as Animation;
  };
  place(document.querySelector("[data-cart-button]")!, rect(900, 10, 40));
});
afterEach(() => vi.unstubAllGlobals());

const motion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }));

describe("flyToCart", () => {
  it("flies a copy of the photo to the cart, removes it on landing and bounces the cart", async () => {
    motion(false);
    const photo = document.getElementById("photo")!;
    place(photo, rect(100, 200, 300));

    const landed = flyToCart(photo, null, "/photo.webp");
    const flying = document.body.querySelector('img[aria-hidden="true"]') as HTMLImageElement;
    expect(flying.src).toContain("/photo.webp");
    expect(flying.style.position).toBe("fixed");
    animations[0]!.finish();
    await landed;

    expect(document.body.querySelector('img[aria-hidden="true"]')).toBeNull();
    expect(animations.map((a) => a.element.matches("[data-cart-button]"))).toEqual([false, true]);
  });

  it("starts from the button when the photo is scrolled out of sight", async () => {
    motion(false);
    const photo = document.getElementById("photo")!;
    place(photo, rect(100, -900, 300));
    const add = document.getElementById("add")!;
    place(add, rect(500, 700, 120));

    const landed = flyToCart(photo, add);
    const flying = document.body.querySelector('div[aria-hidden="true"]') as HTMLElement;
    expect(flying.style.left).toBe(`${500 + 60 - 60}px`);
    animations[0]!.finish();
    await landed;
  });

  it("does nothing under reduced motion, or without a cart icon in view", async () => {
    motion(true);
    const photo = document.getElementById("photo")!;
    place(photo, rect(100, 200, 300));
    await flyToCart(photo, null, "/photo.webp");
    expect(animations).toHaveLength(0);

    motion(false);
    place(document.querySelector("[data-cart-button]")!, rect(5000, 10, 40));
    await flyToCart(photo, null, "/photo.webp");
    expect(animations).toHaveLength(0);
  });
});
