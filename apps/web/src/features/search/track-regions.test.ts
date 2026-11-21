import { describe, expect, it } from "vitest";
import { iou, RegionTracker, type Box } from "./track-regions";

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });
const det = (b: Box, score = 0.9) => ({ box: b, score });

describe("iou", () => {
  it("is 1 for the same box, 0 for disjoint ones, and the overlap share otherwise", () => {
    expect(iou(box(0, 0, 0.5, 0.5), box(0, 0, 0.5, 0.5))).toBe(1);
    expect(iou(box(0, 0, 0.2, 0.2), box(0.5, 0.5, 0.2, 0.2))).toBe(0);
    // 0.5x0.5 ба 0.5x0.5, хагасаар давхцсан: 0.125 / (0.25 + 0.25 - 0.125)
    expect(iou(box(0, 0, 0.5, 0.5), box(0.25, 0, 0.5, 0.5))).toBeCloseTo(1 / 3);
  });
});

describe("RegionTracker", () => {
  it("keeps the same id while a garment moves a little", () => {
    const tracker = new RegionTracker();
    const [first] = tracker.update([det(box(0.1, 0.1, 0.4, 0.5))]);

    const [moved] = tracker.update([det(box(0.12, 0.11, 0.4, 0.5))]);

    expect(moved!.id).toBe(first!.id);
    expect(moved!.box).toEqual(box(0.12, 0.11, 0.4, 0.5)); // хамгийн сүүлийн байрлал
  });

  it("keeps ids stable when the order of detections changes", () => {
    const tracker = new RegionTracker();
    const shirt = box(0, 0, 0.4, 0.4);
    const shoes = box(0.5, 0.6, 0.4, 0.3);
    const [a, b] = tracker.update([det(shirt), det(shoes)]);

    const swapped = tracker.update([det(shoes), det(shirt)]);

    expect(swapped.find((r) => r.box === shirt)!.id).toBe(a!.id);
    expect(swapped.find((r) => r.box === shoes)!.id).toBe(b!.id);
  });

  it("gives a garment that appears a new id", () => {
    const tracker = new RegionTracker();
    tracker.update([det(box(0, 0, 0.4, 0.4))]);

    const regions = tracker.update([det(box(0, 0, 0.4, 0.4)), det(box(0.5, 0.5, 0.3, 0.3))]);

    expect(new Set(regions.map((r) => r.id)).size).toBe(2);
  });

  it("holds a missing garment for two frames before dropping it, so frames do not flicker", () => {
    const tracker = new RegionTracker();
    tracker.update([det(box(0, 0, 0.4, 0.4))]);

    expect(tracker.update([])).toHaveLength(1);
    expect(tracker.update([])).toHaveLength(1);
    expect(tracker.update([])).toHaveLength(0);
  });

  it("does not revive a dropped garment under its old id", () => {
    const tracker = new RegionTracker(0.3, 0);
    const [first] = tracker.update([det(box(0, 0, 0.4, 0.4))]);
    tracker.update([]);

    const [again] = tracker.update([det(box(0, 0, 0.4, 0.4))]);

    expect(again!.id).not.toBe(first!.id);
  });

  it("treats a box that jumped elsewhere as a different garment", () => {
    const tracker = new RegionTracker();
    const [first] = tracker.update([det(box(0, 0, 0.2, 0.2))]);

    const regions = tracker.update([det(box(0.7, 0.7, 0.2, 0.2))]);

    expect(regions.map((r) => r.id)).toContain(first!.id); // хуучин нь хэдэн кадр хүлээгдэж байна
    expect(regions).toHaveLength(2);
  });

  it("matches each detection to at most one track", () => {
    const tracker = new RegionTracker();
    tracker.update([det(box(0, 0, 0.4, 0.4)), det(box(0.05, 0.05, 0.4, 0.4))]);

    const regions = tracker.update([det(box(0.02, 0.02, 0.4, 0.4))]);

    expect(regions).toHaveLength(2); // нэг detection хоёр track-ийг авч чадахгүй: нөгөө нь хүлээгдэнэ
  });

  it("can be reset", () => {
    const tracker = new RegionTracker();
    tracker.update([det(box(0, 0, 0.4, 0.4))]);

    tracker.reset();

    expect(tracker.update([])).toEqual([]);
  });
});
