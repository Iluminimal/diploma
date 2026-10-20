/**
 * Хэрэглэгчийн сонгосон, чирсэн, paste хийсэн, авсан зургийг API-ийн хүлээн авах JPEG болгоно.
 *
 * - API 8 MB хүртэлх JPEG, PNG, WebP авна. iPhone зураг HEIC/HEIF байж болох тул энд decode хийж
 *   (browser чаддаг бол native, жишээ нь Safari; үгүй бол хэрэгтэй үедээ л татагдах `heic-to`-оор)
 *   дахин encode хийнэ.
 * - Бүгдийг урт тал нь 1600 px болтол багасгана: model 224 px-ээр харадаг тул илүү pixel нь зөвхөн
 *   upload-ыг удаашруулна. EXIF orientation-ыг decoder хэрэглэнэ.
 * - Юу ч санах ойгоос гарахгүй: үр дүн нь хайлтыг солих хүртэл дуудагчийн барьдаг `File`.
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

/** iOS заримдаа HEIC файлыг хоосон MIME type-тай өгдөг тул өргөтгөлийг бас тооцно. */
export function looksLikeHeic(file: Blob & { name?: string }): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "");
}

/** `width x height`-ыг томруулалгүйгээр `max` px урт талдаа багтаана. */
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
  // JPEG-д alpha байдаггүй: тунгалаг PNG хар болох байсан.
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
