/**
 * Turn whatever the user picked, dropped, pasted or captured into a JPEG the API accepts.
 *
 * - The API takes JPEG, PNG and WebP up to 8 MB. iPhone photos can be HEIC/HEIF, so those are
 *   decoded here (natively where the browser can, e.g. Safari; otherwise with `heic-to`, which is
 *   only downloaded when needed) and re-encoded.
 * - Everything is downscaled to a 1600 px long edge: the model looks at 224 px, so more pixels
 *   only slow the upload down. EXIF orientation is applied by the decoder.
 * - Nothing leaves memory: the result is a `File` the caller holds until the search is replaced.
 */

export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
export const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.9;

export type ImageInputErrorCode = "not-image" | "too-large" | "decode-failed";

const MESSAGES: Record<ImageInputErrorCode, string> = {
  "not-image": "That file isn't an image. Please choose a photo.",
  "too-large": "That photo is too large. Please choose one under 40 MB.",
  "decode-failed": "We couldn't open that photo. Try a JPEG or PNG instead.",
};

export class ImageInputError extends Error {
  readonly code: ImageInputErrorCode;
  constructor(code: ImageInputErrorCode) {
    super(MESSAGES[code]);
    this.name = "ImageInputError";
    this.code = code;
  }
}

/** iOS sometimes hands over HEIC files with an empty MIME type, so the extension counts too. */
export function looksLikeHeic(file: Blob & { name?: string }): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "");
}

/** Fit `width x height` inside a `max` px long edge without upscaling. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Decoder = (blob: Blob) => Promise<ImageBitmap>;

const nativeDecode: Decoder = (blob) => createImageBitmap(blob, { imageOrientation: "from-image" });

async function heicDecode(blob: Blob): Promise<ImageBitmap> {
  const { heicTo } = await import("heic-to/next");
  return heicTo({ blob, type: "bitmap" });
}

async function decode(blob: Blob, heic: boolean, decoders: { native: Decoder; heic: Decoder }) {
  try {
    return await decoders.native(blob);
  } catch (nativeError) {
    if (!heic) throw nativeError;
    return decoders.heic(blob);
  }
}

function encodeJpeg(bitmap: ImageBitmap): Promise<Blob> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new ImageInputError("decode-failed"));
  // JPEG has no alpha: transparent PNGs would turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageInputError("decode-failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

export async function normalizeImage(
  input: Blob & { name?: string },
  decoders: { native: Decoder; heic: Decoder } = { native: nativeDecode, heic: heicDecode },
): Promise<File> {
  const heic = looksLikeHeic(input);
  if (!heic && !input.type.startsWith("image/")) throw new ImageInputError("not-image");
  if (input.size > MAX_INPUT_BYTES) throw new ImageInputError("too-large");

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(input, heic, decoders);
  } catch {
    throw new ImageInputError("decode-failed");
  }
  try {
    const jpeg = await encodeJpeg(bitmap);
    return new File([jpeg], "photo.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
