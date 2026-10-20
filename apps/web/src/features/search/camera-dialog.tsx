"use client";

import { Camera, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
};

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is blocked. Allow it in your browser's site settings, or upload a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. You can upload a photo instead.";
  }
  if (name === "NotReadableError") return "The camera is in use by another app.";
  return "We couldn't start the camera. You can upload a photo instead.";
}

/**
 * Шууд preview + зураг авалт. Dialog нээлттэй үед л mount хийгддэг тул хаахад state болон stream
 * цэвэрлэгдэнэ.
 */
function CameraPanel({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled || !video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch (cause) {
        if (!cancelled) setError(cameraErrorMessage(cause));
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
        onClose();
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <>
      <div className="bg-muted relative aspect-[4/3] overflow-hidden rounded-2xl">
        <video ref={videoRef} playsInline muted className="size-full object-cover" aria-label="Camera preview" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label="Starting camera" />
          </div>
        )}
        {error && (
          <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button size="lg" onClick={capture} disabled={!ready}>
          <Camera /> Capture
        </Button>
      </div>
    </>
  );
}

/** getUserMedia-аар desktop камераар зураг авна. Dialog хаагдах бүрд stream зогсоно. */
export function CameraDialog({ open, onOpenChange, onCapture }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>Point the camera at the clothing item and capture it.</DialogDescription>
        </DialogHeader>
        <CameraPanel onCapture={onCapture} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
