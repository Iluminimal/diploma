"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageInputError, normalizeImage } from "./normalize-image";
import { useSearchStore } from "./search-store";

/**
 * Ямар ч эх сурвалжаас (сонгогч, drop, paste, камер) зураг хүлээн авч, normalize хийгээд store-д
 * өгнө.
 */
export function useImageInput() {
  const setImage = useSearchStore((s) => s.setImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    async (blob: Blob & { name?: string }) => {
      setError(null);
      setBusy(true);
      try {
        setImage(await normalizeImage(blob));
        return true;
      } catch (cause) {
        setError(cause instanceof ImageInputError ? cause.message : "We couldn't open that photo.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [setImage],
  );

  return { pick, busy, error, clearError: () => setError(null) };
}

/** Drop эсвэл paste хийсэн зүйлсийн эхний зураг. */
export function firstImage(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/") || /\.hei[cf]$/i.test(file.name)) return file;
  }
  return null;
}

/** Хуудасны хаана ч зураг (screenshot, хуулсан зураг) paste хийнэ. Текст paste-д хүрэхгүй. */
export function usePasteImage(onImage: (file: File) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onPaste(event: ClipboardEvent) {
      const file = firstImage(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      onImage(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onImage, enabled]);
}
