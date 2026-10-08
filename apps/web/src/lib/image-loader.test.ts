import { describe, expect, it } from "vitest";
import imageLoader from "./image-loader";

const api = "http://localhost:8000/media/products/060";

describe("imageLoader", () => {
  it("serves API photos through this site's /media route", () => {
    expect(imageLoader({ src: `${api}/60000_400.webp`, width: 300 })).toBe("/media/products/060/60000_400.webp");
  });

  it("picks the 800 px file for wide requests and the 400 px file for narrow ones", () => {
    expect(imageLoader({ src: `${api}/60000_400.webp`, width: 828 })).toBe("/media/products/060/60000_800.webp");
    expect(imageLoader({ src: `${api}/60000_800.webp`, width: 256 })).toBe("/media/products/060/60000_400.webp");
  });

  it("leaves other addresses alone", () => {
    expect(imageLoader({ src: "https://cdn.example.com/a_400.webp", width: 300 })).toBe("https://cdn.example.com/a_400.webp");
    expect(imageLoader({ src: "/local/a_800.webp", width: 100 })).toBe("/local/a_400.webp");
  });
});
