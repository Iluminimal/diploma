"use client";

import { useEffect, useState, type RefObject } from "react";
import { ApiError } from "@/lib/api/errors";
import { detectGarments } from "./search-api";
import { RegionTracker, type TrackedRegion } from "./track-regions";

export type LiveStatus = "running" | "unavailable";

type Options = {
  /** Давталт зөвхөн үнэн үед ажиллана (камер бэлэн, хэрэглэгч асаасан). */
  enabled: boolean;
  /** Хоёр кадрын хоорондох хамгийн бага хугацаа: GPU-г хайлттай хуваалцдаг тул нягт дуудахгүй. */
  intervalMs?: number;
  /** Энэ итгэлээс доош хайрцгийг харуулахгүй (live кадрт шуугиан их). */
  minScore?: number;
  /** Сервер рүү явуулах кадрын урт тал (px): detector 640-д ажилладаг, жижиг кадр хурдан. */
  maxEdge?: number;
  /** Дараалсан хэдэн алдааны дараа live-г зогсоох вэ (429 нь шууд зогсооно). */
  maxFailures?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Видеоны одоогийн кадрыг жижигрүүлж JPEG болгоно. */
function captureFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxEdge: number): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
}

/**
 * Камерын live preview дээрх хувцсыг олно: өмнөх хүсэлт дуусаас хойш хамгийн багадаа `intervalMs` өнгөрсний
 * дараа нэг кадрыг `/search/detect` руу явуулж, хайрцгийг `RegionTracker`-ээр тогтворжуулна. Хүсэлт
 * хэзээ ч давхцахгүй. Таб далд, асаалт унтарсан, компонент устгагдсан үед зогсоно. Алдаа гарвал (429 буюу
 * дараалсан алдаа) `unavailable` болно, зураг авалт үүнээс хамаарахгүй.
 */
export function useLiveDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  { enabled, intervalMs = 350, minScore = 0.4, maxEdge = 480, maxFailures = 3 }: Options,
): { regions: TrackedRegion[]; status: LiveStatus } {
  const [regions, setRegions] = useState<TrackedRegion[]>([]);
  const [status, setStatus] = useState<LiveStatus>("running");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const tracker = new RegionTracker();
    const canvas = document.createElement("canvas");
    let stopped = false;

    async function loop() {
      setStatus("running");
      let failures = 0;
      while (!stopped) {
        const started = performance.now();
        const video = videoRef.current;
        if (!document.hidden && video && video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const frame = await captureFrame(video, canvas, maxEdge);
            if (frame && !stopped) {
              const { regions: found } = await detectGarments(frame, controller.signal);
              if (stopped) return;
              failures = 0;
              // Бүтэн зургийн fallback (label: null) нь хувцас олдоогүй гэсэн үг.
              setRegions(
                tracker.update(found.filter((r) => r.label !== null && r.score >= minScore).map(({ box, score }) => ({ box, score }))),
              );
            }
          } catch (cause) {
            if (stopped) return;
            failures += 1;
            if ((cause instanceof ApiError && cause.status === 429) || failures >= maxFailures) {
              setRegions([]);
              setStatus("unavailable");
              return;
            }
          }
        }
        await sleep(Math.max(0, intervalMs - (performance.now() - started)));
      }
    }
    void loop();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [enabled, intervalMs, minScore, maxEdge, maxFailures, videoRef]);

  // Унтраасан үед хуучин хүрээ харагдахгүй; дахин асаахад шинэ давталт `running` болгоно.
  return enabled ? { regions, status } : { regions: [], status: "running" };
}
