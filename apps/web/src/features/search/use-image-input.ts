"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageInputError, normalizeImage } from "./normalize-image";
import { useSearchStore } from "./search-store";

/** Accept a photo from any source (picker, drop, paste, camera): normalize it, then hand it to the store. */
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

/** First image among dropped or pasted items. */
export function firstImage(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/") || /\.hei[cf]$/i.test(file.name)) return file;
  }
  return null;
}

/** Paste an image (screenshot, copied photo) anywhere on the page. Text pastes are left alone. */
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
