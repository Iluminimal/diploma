"use client";

import { useRouter } from "next/navigation";
import { ImageDropzone } from "@/features/search/image-dropzone";

/** The photo is decoded in the browser, parked in the in-memory search store, then /search runs the query. */
export function HeroUpload() {
  const router = useRouter();
  return <ImageDropzone size="hero" listenForPaste onPicked={() => router.push("/search")} />;
}
