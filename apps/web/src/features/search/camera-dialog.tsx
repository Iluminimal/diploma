"use client";

import { Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DottedFrame } from "./dotted-frame";
import { useLiveDetection } from "./use-live-detection";

const LIVE_KEY = "angel.camera.highlight";

/** Хэрэглэгчийн сонголт (анхдагч нь асаалттай). Storage хаалттай үед ч камер ажиллана. */
function readLivePreference(): boolean {
  try {
    return window.localStorage.getItem(LIVE_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveLivePreference(on: boolean) {
  try {
    window.localStorage.setItem(LIVE_KEY, on ? "on" : "off");
  } catch {
    // Хадгалагдахгүй байж болно (private window): зүгээр.
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
};

/** Камер асахгүй байгаа шалтгаан, `search.camera` доторх орчуулгын түлхүүрээр. */
export function cameraErrorKey(error: unknown): "blocked" | "notFound" | "inUse" | "failed" {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notFound";
  if (name === "NotReadableError") return "inUse";
  return "failed";
}

/**
 * Шууд preview + зураг авалт. Dialog нээлттэй үед л mount хийгддэг тул хаахад state болон stream
 * цэвэрлэгдэнэ.
 */
function CameraPanel({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const t = useTranslations("search.camera");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Видеоны жинхэнэ харьцаа: preview-ийг тайрахгүй байхад л хайрцгууд видео дээр яг давхцана.
  const [aspect, setAspect] = useState(4 / 3);
  const [highlight, setHighlight] = useState(readLivePreference);
  const live = useLiveDetection(videoRef, { enabled: ready && highlight });

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
        if (!cancelled) {
          if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
          setReady(true);
        }
      } catch (cause) {
        if (!cancelled) setError(t(cameraErrorKey(cause)));
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- камер dialog нээгдэх бүрд нэг удаа асна
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
      <div
        className="bg-muted relative mx-auto overflow-hidden rounded-2xl"
        // Босоо кадр (утас) дэлгэцээс хэтрэхгүй: өндөр нь 70vh-аас хэтрэхгүйгээр өргөнийг багасгана.
        style={{ aspectRatio: String(aspect), width: `min(100%, ${70 * aspect}vh)` }}
      >
        <video ref={videoRef} playsInline muted className="size-full object-cover" aria-label={t("preview")} />
        {/* Хувцас бүрийн цэгэн хүрээ: зөвхөн заагч (дарагдахгүй), "Зураг авах" бүтэн кадрыг авна. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {live.regions.map(({ id, box }) => (
            <div
              key={id}
              className="absolute transition-[left,top,width,height] duration-300 ease-out motion-reduce:transition-none"
              style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
            >
              <DottedFrame />
            </div>
          ))}
        </div>
        {highlight && live.regions.length > 0 && (
          <p
            role="status"
            className="type-fine absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-white backdrop-blur-sm"
          >
            {t("liveCount", { count: live.regions.length })}
          </p>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label={t("starting")} />
          </div>
        )}
        {error && (
          <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center type-caption">
            {error}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="camera-highlight"
            checked={highlight}
            onCheckedChange={(next) => {
              setHighlight(next === true);
              saveLivePreference(next === true);
            }}
          />
          <Label htmlFor="camera-highlight" className="cursor-pointer type-caption font-normal">
            {t("live")}
          </Label>
        </div>
        <p className="text-muted-foreground type-fine pl-[1.875rem]">
          {highlight && live.status === "unavailable" ? t("liveUnavailable") : t("liveHint")}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="lg" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button size="lg" onClick={capture} disabled={!ready}>
          <Camera /> {t("capture")}
        </Button>
      </div>
    </>
  );
}

/** getUserMedia-аар desktop камераар зураг авна. Dialog хаагдах бүрд stream зогсоно. */
export function CameraDialog({ open, onOpenChange, onCapture }: Props) {
  const t = useTranslations("search.camera");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <CameraPanel onCapture={onCapture} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
