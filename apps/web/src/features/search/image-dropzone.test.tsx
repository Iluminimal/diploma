import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageDropzone } from "./image-dropzone";
import { ImageInputError } from "./normalize-image";
import { useSearchStore } from "./search-store";

// Decoding needs a real canvas; its own tests cover that. Here it just reports what it was given.
vi.mock("./normalize-image", async (importOriginal) => {
  const original = await importOriginal<typeof import("./normalize-image")>();
  return {
    ...original,
    normalizeImage: vi.fn(async (blob: Blob & { name?: string }) => {
      if (!blob.type.startsWith("image/")) throw new original.ImageInputError("not-image");
      return new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });
    }),
  };
});

const photo = () => new File(["x"], "look.png", { type: "image/png" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  useSearchStore.setState({ image: null });
});
afterEach(() => vi.clearAllMocks());

describe("ImageDropzone", () => {
  it("accepts a chosen file and reports it", async () => {
    const onPicked = vi.fn();
    render(<ImageDropzone onPicked={onPicked} />);
    await userEvent.upload(screen.getByLabelText("Choose a photo", { selector: "input" }), photo());
    await waitFor(() => expect(onPicked).toHaveBeenCalled());
    expect(useSearchStore.getState().image?.file.name).toBe("photo.jpg");
  });

  it("accepts a dropped image", async () => {
    render(<ImageDropzone />);
    const zone = screen.getByText("Drop a photo here").closest("div[class*=border-dashed]")!;
    fireEvent.drop(zone, { dataTransfer: { files: [photo()] } });
    await waitFor(() => expect(useSearchStore.getState().image).not.toBeNull());
  });

  it("tells the user when a dropped file is not an image", async () => {
    render(<ImageDropzone />);
    const zone = screen.getByText("Drop a photo here").closest("div[class*=border-dashed]")!;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(new ImageInputError("not-image").message);
    expect(useSearchStore.getState().image).toBeNull();
  });

  it("takes a pasted image when asked to listen", async () => {
    render(<ImageDropzone listenForPaste />);
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { files: [photo()] } });
    act(() => void window.dispatchEvent(event));
    await waitFor(() => expect(useSearchStore.getState().image).not.toBeNull());
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves text pastes alone", () => {
    render(<ImageDropzone listenForPaste />);
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { files: [] } });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("exposes a camera input that opens the OS camera on phones", () => {
    render(<ImageDropzone />);
    expect(screen.getByLabelText("Take a photo with the camera")).toHaveAttribute("capture", "environment");
  });
});
