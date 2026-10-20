import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeProduct } from "@/test/fixtures";
import { ProductGallery } from "./product-gallery";

const photo = (n: number) => ({ thumb_400: `/m/${n}_400.webp`, thumb_800: `/m/${n}_800.webp`, blur_data_url: null });
const product = makeProduct({ name: "Blue Kurta", image: photo(1) });
const stage = () => screen.getByRole("button", { name: "Enlarge photo of Blue Kurta" });
const shown = () => screen.getAllByRole("img").filter((img) => img.getAttribute("data-active") === "true");

describe("ProductGallery", () => {
  it("shows one photo with no thumbnail strip", () => {
    render(<ProductGallery product={product} />);

    expect(screen.getAllByRole("img", { name: "Blue Kurta" })).toHaveLength(1);
    expect(screen.queryByRole("list", { name: "Photos" })).not.toBeInTheDocument();
  });

  it("cross-fades between photos: only the current one is visible and announced", async () => {
    render(<ProductGallery product={product} images={[photo(1), photo(2), photo(3)]} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "Blue Kurta" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Show photo 2" }));

    expect(shown()[0]).toHaveAttribute("src", expect.stringContaining("2_800"));
    expect(shown()[0]).toHaveClass("opacity-100");
    expect(screen.getByRole("button", { name: "Show photo 2" })).toHaveAttribute("aria-current", "true");
  });

  it("turns the page with a swipe, in both directions and around the ends", () => {
    render(<ProductGallery product={product} images={[photo(1), photo(2)]} />);
    const swipe = (from: number, to: number) => {
      fireEvent.pointerDown(stage(), { pointerType: "touch", clientX: from });
      fireEvent.pointerUp(stage(), { pointerType: "touch", clientX: to });
    };

    swipe(300, 200);
    expect(shown()[0]).toHaveAttribute("src", expect.stringContaining("2_800"));
    swipe(300, 290); // хэт богино
    expect(shown()[0]).toHaveAttribute("src", expect.stringContaining("2_800"));
    swipe(100, 220);
    expect(shown()[0]).toHaveAttribute("src", expect.stringContaining("1_800"));
    swipe(100, 220); // эхнээс нь буцахад сүүлийнх рүү очно
    expect(shown()[0]).toHaveAttribute("src", expect.stringContaining("2_800"));
  });

  it("does not swipe a single photo", () => {
    render(<ProductGallery product={product} />);

    fireEvent.pointerDown(stage(), { pointerType: "touch", clientX: 300 });
    fireEvent.pointerUp(stage(), { pointerType: "touch", clientX: 100 });

    expect(shown()).toHaveLength(1);
  });

  it("zooms around the mouse pointer and lets go when it leaves", () => {
    render(<ProductGallery product={product} />);
    stage().getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON() {} });

    fireEvent.pointerMove(stage(), { pointerType: "mouse", clientX: 50, clientY: 100 });
    expect(stage().dataset.zoom).toBe("true");
    expect(stage().style.getPropertyValue("--zx")).toBe("25%");
    expect(stage().style.getPropertyValue("--zy")).toBe("25%");

    fireEvent.pointerLeave(stage());
    expect(stage().dataset.zoom).toBe("false");
  });

  it("does not zoom for a finger", () => {
    render(<ProductGallery product={product} />);

    fireEvent.pointerMove(stage(), { pointerType: "touch", clientX: 50, clientY: 100 });

    expect(stage().dataset.zoom).toBeUndefined();
  });
});
