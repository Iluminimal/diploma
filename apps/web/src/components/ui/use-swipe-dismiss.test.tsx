import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipeDismiss } from "./use-swipe-dismiss";

function Panel({ axis, onDismiss }: { axis: "x" | "y"; onDismiss: () => void }) {
  const swipe = useSwipeDismiss(axis, onDismiss);
  return (
    <div data-testid="panel" {...swipe}>
      panel
    </div>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const touch = { pointerType: "touch", pointerId: 1 };
/** Хуруу нэг цэгээс нөгөө рүү `ms` миллисекундэд явна. */
function drag(panel: HTMLElement, from: [number, number], to: [number, number], ms: number) {
  fireEvent.pointerDown(panel, { ...touch, clientX: from[0], clientY: from[1] });
  vi.advanceTimersByTime(ms / 2);
  fireEvent.pointerMove(panel, { ...touch, clientX: to[0], clientY: to[1] });
  vi.advanceTimersByTime(ms / 2);
  fireEvent.pointerUp(panel, { ...touch, clientX: to[0], clientY: to[1] });
}

describe("useSwipeDismiss", () => {
  it("follows the finger, springs back when slow and short, dismisses when far", () => {
    const onDismiss = vi.fn();
    render(<Panel axis="x" onDismiss={onDismiss} />);
    const panel = screen.getByTestId("panel");

    fireEvent.pointerDown(panel, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(panel, { ...touch, clientX: 90, clientY: 12 });
    expect(panel.style.translate).toBe("80px 0");
    vi.advanceTimersByTime(600);
    fireEvent.pointerUp(panel, { ...touch, clientX: 90, clientY: 12 });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.translate).toBe("");

    drag(panel, [10, 10], [220, 12], 800);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("with a handle, only a drag that starts on it moves the panel", () => {
    function Sheet({ onDismiss }: { onDismiss: () => void }) {
      const swipe = useSwipeDismiss("y", onDismiss, "[data-handle]");
      return (
        <div data-testid="sheet" {...swipe}>
          <div data-handle data-testid="handle">
            title
          </div>
          <div data-testid="list">list</div>
        </div>
      );
    }
    const onDismiss = vi.fn();
    render(<Sheet onDismiss={onDismiss} />);

    drag(screen.getByTestId("list"), [50, 10], [52, 300], 100);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId("handle"), { ...touch, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(screen.getByTestId("sheet"), { ...touch, clientX: 50, clientY: 60 });
    vi.advanceTimersByTime(60);
    fireEvent.pointerUp(screen.getByTestId("sheet"), { ...touch, clientX: 50, clientY: 300 });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on a quick flick even if it is short", () => {
    const onDismiss = vi.fn();
    render(<Panel axis="y" onDismiss={onDismiss} />);

    drag(screen.getByTestId("panel"), [50, 10], [52, 90], 100);

    expect(onDismiss).toHaveBeenCalled();
  });

  it("leaves vertical scrolling alone for a horizontal panel, and ignores the mouse", () => {
    const onDismiss = vi.fn();
    render(<Panel axis="x" onDismiss={onDismiss} />);
    const panel = screen.getByTestId("panel");

    drag(panel, [10, 10], [30, 300], 400);
    fireEvent.pointerDown(panel, { pointerType: "mouse", clientX: 0, clientY: 0 });
    fireEvent.pointerMove(panel, { pointerType: "mouse", clientX: 400, clientY: 0 });
    fireEvent.pointerUp(panel, { pointerType: "mouse", clientX: 400, clientY: 0 });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(panel.style.translate).toBe("");
  });
});
