import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { detectGarments } from "./search-api";
import { useLiveDetection } from "./use-live-detection";

vi.mock("./search-api", () => ({ detectGarments: vi.fn() }));
const detect = vi.mocked(detectGarments);

const region = (x: number, score = 0.9, label: string | null = "top, t-shirt, sweatshirt") => ({
  box: { x, y: 0.1, width: 0.4, height: 0.5 },
  label,
  score,
});
const answer = (...regions: ReturnType<typeof region>[]) => ({ regions, detect_ms: 20 });

function fakeVideo() {
  return { current: { readyState: 4, videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement };
}

let video = fakeVideo();

beforeEach(() => {
  video = fakeVideo();
  vi.useFakeTimers();
  detect.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const settle = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useLiveDetection", () => {
  it("sends a downscaled frame and returns the garments above the score threshold", async () => {
    detect.mockResolvedValue(answer(region(0.1), region(0.5, 0.2), region(0, 0.9, null)));
    const { result } = renderHook(() => useLiveDetection(video, { enabled: true }));

    await settle();

    expect(detect).toHaveBeenCalledTimes(1);
    expect(detect.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(result.current.regions.map((r) => r.box.x)).toEqual([0.1]); // 0.2 оноотой ба label-гүй (бүтэн зураг) нь хасагдсан
    expect(result.current.status).toBe("running");
  });

  it("waits the interval between frames", async () => {
    detect.mockResolvedValue(answer(region(0.1)));
    renderHook(() => useLiveDetection(video, { enabled: true, intervalMs: 350 }));

    await settle();
    await settle(300);
    expect(detect).toHaveBeenCalledTimes(1);
    await settle(100);
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("never has two requests in flight", async () => {
    detect.mockReturnValue(new Promise(() => {}));
    renderHook(() => useLiveDetection(video, { enabled: true }));

    await settle(5000);

    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("keeps a garment's id while it moves", async () => {
    detect.mockResolvedValueOnce(answer(region(0.1))).mockResolvedValueOnce(answer(region(0.12)));
    const { result } = renderHook(() => useLiveDetection(video, { enabled: true }));

    await settle();
    const first = result.current.regions[0]!.id;
    await settle(400);

    expect(result.current.regions[0]!.id).toBe(first);
    expect(result.current.regions[0]!.box.x).toBe(0.12);
  });

  it("does nothing while disabled, and stops (aborting the request) when switched off", async () => {
    detect.mockImplementation(() => new Promise(() => {}));
    const { rerender, result } = renderHook(({ enabled }) => useLiveDetection(video, { enabled }), {
      initialProps: { enabled: false },
    });
    await settle(1000);
    expect(detect).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await settle();
    const signal = detect.mock.calls[0]![1]!;
    expect(signal.aborted).toBe(false);

    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    expect(result.current.regions).toEqual([]);
    await settle(2000);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("stops on unmount", async () => {
    detect.mockResolvedValue(answer(region(0.1)));
    const { unmount } = renderHook(() => useLiveDetection(video, { enabled: true }));
    await settle();

    unmount();
    await settle(3000);

    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("pauses while the tab is hidden and resumes after", async () => {
    detect.mockResolvedValue(answer(region(0.1)));
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    renderHook(() => useLiveDetection(video, { enabled: true }));

    await settle(2000);
    expect(detect).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    await settle(400);
    expect(detect).toHaveBeenCalled();
  });

  it("waits for the video to have a frame", async () => {
    detect.mockResolvedValue(answer(region(0.1)));
    Object.assign(video.current, { readyState: 0, videoWidth: 0 });
    renderHook(() => useLiveDetection(video, { enabled: true }));

    await settle(1000);
    expect(detect).not.toHaveBeenCalled();

    Object.assign(video.current, { readyState: 4, videoWidth: 640 });
    await settle(400);
    expect(detect).toHaveBeenCalled();
  });

  it("gives up immediately when rate limited, and clears the frames", async () => {
    detect.mockResolvedValueOnce(answer(region(0.1))).mockRejectedValue(new ApiError({ status: 429, title: "Too many" }));
    const { result } = renderHook(() => useLiveDetection(video, { enabled: true }));
    await settle();
    expect(result.current.regions).toHaveLength(1);

    await settle(400);

    expect(result.current.status).toBe("unavailable");
    expect(result.current.regions).toEqual([]);
    await settle(3000);
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("tolerates a couple of failed frames but gives up after three in a row", async () => {
    detect
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(answer(region(0.1)))
      .mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useLiveDetection(video, { enabled: true }));

    await settle(400 * 3);
    expect(result.current.status).toBe("running"); // 2 алдаа, амжилт: тоолуур тэглэгдсэн
    expect(result.current.regions).toHaveLength(1);

    await settle(400 * 4);
    expect(result.current.status).toBe("unavailable");
  });
});
