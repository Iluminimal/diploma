"use client";

import { Camera, ImagePlus, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { firstImage, useImageInput, usePasteImage } from "./use-image-input";

// The camera dialog (and the dialog library behind it) is only needed once someone asks for it.
const CameraDialog = dynamic(() => import("./camera-dialog").then((module) => module.CameraDialog));

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type Props = {
  /** Called after a photo was accepted (the home page uses it to navigate to /search). */
  onPicked?: () => void;
  /** Also take pastes while mounted (used where no other listener exists). */
  listenForPaste?: boolean;
  className?: string;
  size?: "default" | "hero";
};

/** True on phones and tablets, where the OS camera sheet (`capture`) beats an in-page video. */
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
        className={cn(
          "border-border flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed text-center transition-colors",
          size === "hero" ? "px-6 py-12 sm:py-16" : "px-6 py-14 sm:py-20",
          dragging ? "border-brand bg-brand/5" : "bg-muted/30",
        )}
      >
        <div className="bg-background shadow-soft grid size-14 place-items-center rounded-2xl">
          {busy ? <Loader2 className="size-6 animate-spin" aria-label="Preparing photo" /> : <ImagePlus className="size-6" />}
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-medium">{dragging ? "Drop to search" : "Drop a photo here"}</p>
          <p className="text-muted-foreground text-sm">
            or paste one with <kbd className="bg-secondary text-foreground rounded px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl V</kbd>. JPEG,
            PNG, WebP or iPhone HEIC.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button size="lg" className="h-11 px-5" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus /> Choose a photo
          </Button>
          <Button variant="outline" size="lg" className="h-11 px-5" onClick={takePhoto} disabled={busy}>
            <Camera /> Take a photo
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Your photo is used only for this search and is never stored.</p>
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
