import { DT, MAX_RACE_TICKS } from "./simulation";
import type { GhostFrame } from "./types";

export type GhostTimeline = Readonly<{
  recordedProgress: Float64Array;
  maximumProgress: Float64Array;
}>;

/** Copy real tick positions and index their first passage through each distance. */
export function buildGhostTimeline(frames: GhostFrame[]): GhostTimeline {
  if (!Array.isArray(frames) || frames.length > MAX_RACE_TICKS + 1) {
    throw new Error(
      "Ghost history must contain at most 36,001 recorded frames.",
    );
  }
  const recordedProgress = new Float64Array(frames.length);
  const maximumProgress = new Float64Array(frames.length);
  let maximum = 0;
  for (let tick = 0; tick < frames.length; tick++) {
    const frame = frames[tick];
    if (
      !frame ||
      ["distance", "lateral", "speed", "airHeight"].some(
        (key) => !Number.isFinite(frame[key as keyof GhostFrame]),
      )
    ) {
      throw new Error("Every ghost frame requires finite recorded positions.");
    }
    if (frame.distance < 0)
      throw new Error("Ghost progress cannot be negative.");
    recordedProgress[tick] = frame.distance;
    maximum = Math.max(maximum, frame.distance);
    maximumProgress[tick] = maximum;
  }
  return Object.freeze({ recordedProgress, maximumProgress });
}

/** Positive means behind the recorded ghost; negative means ahead. */
export function ghostGap(
  timeline: GhostTimeline,
  distance: number,
  currentTime: number,
): number | null {
  const { recordedProgress, maximumProgress } = timeline;
  const count = recordedProgress.length;
  if (
    !count ||
    !Number.isFinite(distance) ||
    !Number.isFinite(currentTime) ||
    currentTime < 0 ||
    distance < recordedProgress[0] ||
    distance > maximumProgress[count - 1]
  )
    return null;

  // Lower bound retains the earliest arrival when a ghost waits or rewinds.
  let low = 0,
    high = count - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (maximumProgress[middle] < distance) low = middle + 1;
    else high = middle;
  }
  if (recordedProgress[low] === distance) return currentTime - low * DT;
  if (low === 0) return null;

  const before = recordedProgress[low - 1],
    after = recordedProgress[low];
  // Interpolate the actual neighboring tick positions, not the running maximum:
  // after a rewind the previous tick can lie behind its earlier best progress.
  if (after <= before || distance < before || distance > after) return null;
  const fraction = (distance - before) / (after - before);
  return currentTime - (low - 1 + fraction) * DT;
}
