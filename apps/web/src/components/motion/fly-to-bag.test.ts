import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flyToBag } from "./fly-to-bag";

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function scene({ withTarget = true } = {}) {
  document.body.innerHTML = withTarget ? '<button data-cart-target></button><img id="photo" src="/p.webp" />' : '<img id="photo" src="/p.webp" />';
  const photo = document.getElementById("photo") as HTMLImageElement;
  photo.getBoundingClientRect = () => rect(100, 200, 200, 267);
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  if (target) target.getBoundingClientRect = () => rect(1000, 10, 24, 24);
  return photo;
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") ? reduce : false }));
}

let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  animate = vi.fn(() => ({}) as Animation);
  HTMLImageElement.prototype.animate = animate as unknown as typeof HTMLImageElement.prototype.animate;
  stubMotion(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("flyToBag", () => {
  it("sends a copy of the photo from where it is to the bag, shrinking on the way", () => {
    const photo = scene();

    flyToBag(photo);

    const ghost = [...document.querySelectorAll("img")].find((img) => img !== photo)!;
    expect(ghost.src).toContain("/p.webp");
    expect(ghost.style.left).toBe("100px");
    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    const [frames, options] = animate.mock.calls[0]!;
    expect(frames.at(-1).transform).toContain("translate(812px, -311.5px)"); // bag-ийн төв рүү
    expect(options.duration).toBe(650);
  });

  it("takes the copy away when the flight ends", () => {
    const photo = scene();
    const animation: { onfinish?: () => void } = {};
    animate.mockReturnValue(animation);

    flyToBag(photo);
    animation.onfinish?.();

    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it.each([
    ["the bag button is not on the page", () => (scene({ withTarget: false }), "no-target")],
    ["motion is reduced", () => (stubMotion(true), "reduced")],
  ])("does nothing when %s", (_label, arrange) => {
    const photo = scene();
    arrange();

    flyToBag(arrange() === "no-target" ? document.getElementById("photo") : photo);

    expect(animate).not.toHaveBeenCalled();
    expect(document.querySelectorAll("img").length).toBeLessThanOrEqual(1);
  });

  it("ignores a missing or non-image source", () => {
    scene();

    flyToBag(null);
    flyToBag(document.querySelector("[data-cart-target]"));

    expect(animate).not.toHaveBeenCalled();
  });

  it("cleans up even where the browser has no Web Animations API", () => {
    const photo = scene();
    // @ts-expect-error jsdom-ийн хуучин орчин: animate байхгүй
    HTMLImageElement.prototype.animate = undefined;

    flyToBag(photo);

    expect(document.querySelectorAll("img")).toHaveLength(1);
  });
});
