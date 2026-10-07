import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitWithin, ImageInputError, looksLikeHeic, MAX_INPUT_BYTES, normalizeImage } from "./normalize-image";

function bitmap(width: number, height: number) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function file(name: string, type: string, size = 10) {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

let drawn: { width: number; height: number } | null = null;

beforeEach(() => {
  drawn = null;
  // jsdom has no canvas: fake just enough to observe the output size and encoding.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    drawn = { width: this.width, height: this.height };
    return { fillRect: vi.fn(), drawImage: vi.fn(), set fillStyle(_: string) {} } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb, type) =>
    cb(new Blob(["jpeg"], { type: type ?? "image/jpeg" })),
  );
});

afterEach(() => vi.restoreAllMocks());

describe("fitWithin", () => {
  it("scales the long edge down to 1600 and keeps the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 800, height: 1600 });
  });
  it("never upscales", () => {
    expect(fitWithin(400, 300)).toEqual({ width: 400, height: 300 });
  });
});

describe("looksLikeHeic", () => {
  it("recognises HEIC by type or by extension (iOS may send an empty type)", () => {
    expect(looksLikeHeic(file("a.bin", "image/heic"))).toBe(true);
    expect(looksLikeHeic(file("IMG_0001.HEIC", ""))).toBe(true);
    expect(looksLikeHeic(file("a.heif", "image/heif"))).toBe(true);
    expect(looksLikeHeic(file("a.jpg", "image/jpeg"))).toBe(false);
  });
});

describe("normalizeImage", () => {
  const decoders = () => ({ native: vi.fn(async () => bitmap(4000, 3000)), heic: vi.fn(async () => bitmap(3000, 4000)) });

  it("rejects things that are not images", async () => {
    await expect(normalizeImage(file("notes.txt", "text/plain"), decoders())).rejects.toMatchObject({ code: "not-image" });
  });

  it("rejects absurdly large inputs before decoding them", async () => {
    const d = decoders();
    await expect(normalizeImage(file("big.jpg", "image/jpeg", MAX_INPUT_BYTES + 1), d)).rejects.toMatchObject({ code: "too-large" });
    expect(d.native).not.toHaveBeenCalled();
  });

  it("downsizes to a JPEG named photo.jpg", async () => {
    const d = decoders();
    const out = await normalizeImage(file("holiday.png", "image/png"), d);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo.jpg");
    expect(drawn).toEqual({ width: 1600, height: 1200 });
    expect(d.heic).not.toHaveBeenCalled();
  });

  it("uses the native decoder for HEIC when the browser can (Safari)", async () => {
    const d = decoders();
    await normalizeImage(file("IMG.heic", "image/heic"), d);
    expect(d.native).toHaveBeenCalled();
    expect(d.heic).not.toHaveBeenCalled();
  });

  it("falls back to the HEIC decoder when the browser can't read it", async () => {
    const d = decoders();
    d.native.mockRejectedValue(new Error("unsupported"));
    const out = await normalizeImage(file("IMG.heic", "image/heic"), d);
    expect(d.heic).toHaveBeenCalledOnce();
    expect(drawn).toEqual({ width: 1200, height: 1600 });
    expect(out.type).toBe("image/jpeg");
  });

  it("does not try the HEIC decoder for other formats", async () => {
    const d = decoders();
    d.native.mockRejectedValue(new Error("corrupt"));
    await expect(normalizeImage(file("a.jpg", "image/jpeg"), d)).rejects.toBeInstanceOf(ImageInputError);
    expect(d.heic).not.toHaveBeenCalled();
  });

  it("reports an unreadable HEIC as a decode failure and frees the bitmap otherwise", async () => {
    const d = decoders();
    d.native.mockRejectedValue(new Error("x"));
    d.heic.mockRejectedValue(new Error("y"));
    await expect(normalizeImage(file("a.heic", "image/heic"), d)).rejects.toMatchObject({ code: "decode-failed" });

    const b = bitmap(10, 10);
    await normalizeImage(file("a.jpg", "image/jpeg"), { native: async () => b, heic: d.heic });
    expect(b.close).toHaveBeenCalled();
  });
});
