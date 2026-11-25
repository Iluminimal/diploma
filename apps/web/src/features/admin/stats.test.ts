import { describe, expect, it } from "vitest";
import { change, niceCeiling } from "./stats";

describe("change", () => {
  it("is a rounded percentage against the previous period", () => {
    expect(change(150, 100)).toEqual({ kind: "up", percent: 50 });
    expect(change(75, 100)).toEqual({ kind: "down", percent: 25 });
    expect(change(1, 3)).toEqual({ kind: "down", percent: 67 });
  });

  it("calls a tiny move flat", () => {
    expect(change(1001, 1000)).toEqual({ kind: "flat", percent: 0 });
    expect(change(5, 5)).toEqual({ kind: "flat", percent: 0 });
  });

  it("has no percentage when there was nothing before", () => {
    expect(change(40, 0)).toEqual({ kind: "new", percent: 0 });
    expect(change(0, 0)).toEqual({ kind: "none", percent: 0 });
  });

  it("shows a drop to nothing as a 100% fall", () => {
    expect(change(0, 20)).toEqual({ kind: "down", percent: 100 });
  });
});

describe("niceCeiling", () => {
  it.each([
    [0, 1],
    [-5, 1],
    [1, 1],
    [1.5, 2],
    [3, 5],
    [5, 5],
    [5.1, 10],
    [87, 100],
    [26990, 50000],
    [120000, 200000],
  ])("rounds %d up to %d", (value, expected) => {
    expect(niceCeiling(value)).toBe(expected);
  });
});
