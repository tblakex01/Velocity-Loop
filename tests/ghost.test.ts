import { describe, expect, it } from "vitest";
import { buildGhostTimeline, ghostGap } from "../src/game/ghost";
import { DT, MAX_RACE_TICKS } from "../src/game/simulation";
import type { GhostFrame } from "../src/game/types";

function frames(distances: number[]): GhostFrame[] {
  return distances.map((distance) => ({
    distance,
    lateral: 0,
    speed: 0,
    airHeight: 0,
  }));
}

describe("recorded ghost arrival times", () => {
  it("computes a 50 km/h player versus 60 km/h ghost gap from actual recorded frames", () => {
    const ghostSpeed = 60 / 3.6;
    const playerSpeed = 50 / 3.6;
    const distance = 10;
    const timeline = buildGhostTimeline(
      frames(Array.from({ length: 121 }, (_, tick) => tick * DT * ghostSpeed)),
    );
    expect(ghostGap(timeline, distance, distance / playerSpeed)).toBeCloseTo(
      distance / playerSpeed - distance / ghostSpeed,
      12,
    );
    expect(ghostGap(timeline, distance, distance / (70 / 3.6))).toBeLessThan(0);
  });
  it("reports the exact personal-best difference at the finish", () => {
    const timeline = buildGhostTimeline(frames([0, 10, 20, 30]));
    const playerFinish = 5 * DT;
    expect(ghostGap(timeline, 30, playerFinish)).toBe(playerFinish - 3 * DT);
  });
  it("uses earliest arrival for stationary duplicates but includes the real wait before the next advance", () => {
    const timeline = buildGhostTimeline(frames([0, 10, 10, 10, 20]));
    expect(ghostGap(timeline, 10, 5 * DT)).toBe(4 * DT);
    expect(ghostGap(timeline, 15, 5 * DT)).toBeCloseTo(1.5 * DT, 12);
    expect(ghostGap(timeline, 0, 0)).toBe(0);
  });
  it("finds first arrival through crash rewinds and interpolates the real previous position", () => {
    const timeline = buildGhostTimeline(frames([0, 10, 20, 15, 19, 25]));
    expect(ghostGap(timeline, 18, 6 * DT)).toBeCloseTo((6 - 1.8) * DT, 12);
    expect(ghostGap(timeline, 20, 6 * DT)).toBeCloseTo(4 * DT, 12);
    expect(ghostGap(timeline, 22, 6 * DT)).toBeCloseTo((6 - 4.5) * DT, 12);
    expect(ghostGap(timeline, 25, 6 * DT)).toBeCloseTo(DT, 12);
  });
  it("returns no gap for empty, nonfinite, negative or unrecorded progress", () => {
    expect(ghostGap(buildGhostTimeline([]), 0, 0)).toBeNull();
    const timeline = buildGhostTimeline(frames([10, 20]));
    for (const distance of [0, -1, 21, NaN, Infinity])
      expect(ghostGap(timeline, distance, 1)).toBeNull();
    for (const time of [-1, NaN, Infinity])
      expect(ghostGap(timeline, 15, time)).toBeNull();
  });
  it("handles a stationary ghost without inventing arrivals beyond its recorded position", () => {
    const timeline = buildGhostTimeline(frames([0, 0, 0]));
    expect(ghostGap(timeline, 0, 2 * DT)).toBe(2 * DT);
    expect(ghostGap(timeline, 0.1, 2 * DT)).toBeNull();
  });
  it("copies input progress so later changes to frame objects cannot alter arrival history", () => {
    const original = frames([0, 10]);
    const timeline = buildGhostTimeline(original);
    original[1].distance = 100;
    expect(ghostGap(timeline, 10, 2 * DT)).toBe(DT);
    expect(ghostGap(timeline, 100, 2 * DT)).toBeNull();
  });
  it("rejects invalid or excessive recorded frames", () => {
    for (const key of ["distance", "lateral", "speed", "airHeight"] as const) {
      expect(() =>
        buildGhostTimeline([{ ...frames([0])[0], [key]: Infinity }]),
      ).toThrow();
    }
    expect(() => buildGhostTimeline(frames([-1]))).toThrow();
    expect(() =>
      buildGhostTimeline(Array(MAX_RACE_TICKS + 2).fill(frames([0])[0])),
    ).toThrow();
    expect(() => buildGhostTimeline(Array(2))).toThrow();
    expect(() => buildGhostTimeline(null as never)).toThrow();
  });
});
