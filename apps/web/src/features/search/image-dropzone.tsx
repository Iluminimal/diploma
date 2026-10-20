"use client";

import { Camera, ImagePlus, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { firstImage, useImageInput, usePasteImage } from "./use-image-input";

// Камерын dialog (мөн ард нь байх dialog library) хүн хүсэх үед л хэрэгтэй.
const CameraDialog = dynamic(() => import("./camera-dialog").then((module) => module.CameraDialog));

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type Props = {
  /** Зураг хүлээн зөвшөөрөгдсөний дараа дуудна (нүүр хуудас үүгээр /search руу шилжинэ). */
  onPicked?: () => void;
  /** Mount хийгдсэн үед paste-ыг бас авна (өөр listener байхгүй газар хэрэглэнэ). */
  listenForPaste?: boolean;
  className?: string;
  size?: "default" | "hero" | "compact";
};

/** Утас, tablet дээр true: OS-ийн камерын sheet (`capture`) нь хуудас доторх видеооноос дээр. */
function prefersNativeCamera(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function ImageDropzone({ onPicked, listenForPaste = false, className, size = "default" }: Props) {
  const { pick, busy, error } = useImageInput();
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(false);

  async function accept(file: File | Blob | undefined | null) {
    if (!file) return;
    if (await pick(file)) onPicked?.();
  }

  usePasteImage((file) => void accept(file), listenForPaste);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const files = event.dataTransfer.files;
    void accept(firstImage(files) ?? files[0]);
  }

  function takePhoto() {
    if (prefersNativeCamera() || !navigator.mediaDevices?.getUserMedia) captureRef.current?.click();
    else {
      setCameraRequested(true);
      setCameraOpen(true);
    }
  }

  return (
    <div className={className}>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        data-slot="dropzone"
        className={cn(
          "flex flex-col items-center justify-center rounded-3xl text-center transition-[background-color,box-shadow] duration-200",
          size === "compact" ? "gap-4 rounded-2xl px-4 py-8" : "gap-5",
          size === "hero" && "px-6 py-12 sm:py-16",
          size === "default" && "px-6 py-14 sm:py-20",
          dragging ? "bg-brand/10 ring-brand ring-2 ring-inset" : "bg-secondary",
        )}
      >
        <div className="bg-background grid size-14 place-items-center rounded-full">
          {busy ? <Loader2 className="size-6 animate-spin" aria-label="Preparing photo" /> : <ImagePlus className="size-6" />}
        </div>
        <div className="space-y-1.5">
          <p className="type-heading">{dragging ? "Drop to search" : "Drop a photo here"}</p>
          <p className="text-muted-foreground type-caption">
            or paste one with <kbd className="bg-secondary text-foreground rounded px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl V</kbd>
            {size !== "compact" && ". JPEG, PNG, WebP or iPhone HEIC."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button size="lg" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus /> Choose a photo
          </Button>
          <Button variant="bordered" size="lg" onClick={takePhoto} disabled={busy}>
            <Camera /> Take a photo
          </Button>
        </div>
        <p className="text-muted-foreground type-fine">Your photo is used only for this search and is never stored.</p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a photo"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Take a photo with the camera"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {cameraRequested && (
        <CameraDialog open={cameraOpen} onOpenChange={setCameraOpen} onCapture={(file) => void accept(file)} />
      )}
    </div>
  );
}
