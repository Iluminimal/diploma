import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { CameraDialog } from "./camera-dialog";
import { detectGarments } from "./search-api";

vi.mock("./search-api", () => ({ detectGarments: vi.fn() }));
const detect = vi.mocked(detectGarments);

const region = (x: number, y: number, width: number, height: number) => ({
  box: { x, y, width, height },
  label: "top, t-shirt, sweatshirt",
  score: 0.9,
});
const stop = vi.fn();

beforeEach(() => {
  detect.mockReset();
  stop.mockReset();
  window.localStorage.clear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
  });
  // jsdom-д видео, canvas байхгүй: бэлэн кадр бүхий 640x480 камер дүрслэнэ.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openCamera(onCapture = vi.fn()) {
  const view = render(<CameraDialog open onOpenChange={() => {}} onCapture={onCapture} />);
  await screen.findByLabelText("Camera preview");
  return { ...view, onCapture };
}

const frames = (container: HTMLElement = document.body) => container.querySelectorAll('[class*="border-dotted"]');

describe("CameraDialog live highlighting", () => {
  it("outlines each garment the preview shows and counts them", async () => {
    detect.mockResolvedValue({ regions: [region(0.1, 0.1, 0.4, 0.5), region(0.5, 0.6, 0.3, 0.3)], detect_ms: 30 });
    await openCamera();

    expect(await screen.findByRole("status")).toHaveTextContent("2 garments");
    expect(frames()).toHaveLength(2);
    const [first] = frames();
    expect(first!.parentElement).toHaveStyle({ left: "10%", top: "10%", width: "40%", height: "50%" });
    expect(screen.getByLabelText("Highlight garments")).toBeChecked();
    expect(screen.getByText(/never stored/)).toBeInTheDocument();
  });

  it("matches the preview shape to the camera's real aspect ratio so frames line up", async () => {
    detect.mockResolvedValue({ regions: [], detect_ms: 10 });
    await openCamera();

    const preview = screen.getByLabelText("Camera preview").parentElement!;
    expect(parseFloat(preview.style.aspectRatio)).toBeCloseTo(640 / 480); // jsdom "1.33 / 1" болгоно
  });

  it("sends nothing when the user turns the highlight off, and remembers the choice", async () => {
    detect.mockResolvedValue({ regions: [region(0.1, 0.1, 0.4, 0.5)], detect_ms: 30 });
    await openCamera();
    await screen.findByRole("status");
    const calls = detect.mock.calls.length;

    await userEvent.click(screen.getByLabelText("Highlight garments"));

    expect(frames()).toHaveLength(0);
    expect(window.localStorage.getItem("angel.camera.highlight")).toBe("off");
    await act(() => new Promise((resolve) => setTimeout(resolve, 900)));
    expect(detect.mock.calls.length).toBe(calls);
  });

  it("starts switched off when the user turned it off earlier", async () => {
    window.localStorage.setItem("angel.camera.highlight", "off");

    await openCamera();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));

    expect(screen.getByLabelText("Highlight garments")).not.toBeChecked();
    expect(detect).not.toHaveBeenCalled();
  });

  it("says live highlighting is unavailable when the server refuses, and still captures", async () => {
    detect.mockRejectedValue(new ApiError({ status: 429, title: "Too many" }));
    const { onCapture } = await openCamera();

    expect(await screen.findByText(/unavailable right now/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Capture" }));

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0]![0]).toBeInstanceOf(File);
  });

  it("captures the whole frame, not a garment, and stops the camera", async () => {
    detect.mockResolvedValue({ regions: [region(0.1, 0.1, 0.4, 0.5)], detect_ms: 30 });
    const { onCapture, unmount } = await openCamera();
    await screen.findByRole("status");

    await userEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(onCapture).toHaveBeenCalledTimes(1);

    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
