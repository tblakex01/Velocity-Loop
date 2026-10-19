import { validateConfig } from "./definitions";
import {
  createRace,
  DT,
  MAX_RACE_TICKS,
  stepRace,
  validateInput,
} from "./simulation";
import type {
  GhostFrame,
  RaceConfig,
  RaceInput,
  RaceState,
  Replay,
} from "./types";

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(message);
  return value as Record<string, unknown>;
}
function fields(
  value: Record<string, unknown>,
  allowed: string[],
  message: string,
  optional: string[] = [],
) {
  if (
    Object.keys(value).some(
      (key) => !allowed.includes(key) && !optional.includes(key),
    ) ||
    allowed.some((key) => !(key in value))
  )
    throw new Error(message);
}

/** Validate at the boundary and copy only the canonical replay fields. */
export function validateReplay(payload: unknown): Replay {
  const source = object(payload, "A race replay is required.");
  fields(
    source,
    ["version", "config", "inputs", "finishTime", "createdAt"],
    "Replay fields do not match version 1.",
  );
  if (source.version !== 1)
    throw new Error("This replay version is not supported.");
  const configSource = object(source.config, "Race configuration is required.");
  fields(
    configSource,
    ["courseId", "carId", "assist", "laps"],
    "Replay configuration contains invalid fields.",
    ["revision"],
  );
  const config = {
    ...configSource,
    revision: configSource.revision === undefined ? 1 : configSource.revision,
  } as RaceConfig;
  validateConfig(config);
  if (
    !Array.isArray(source.inputs) ||
    source.inputs.length === 0 ||
    source.inputs.length > MAX_RACE_TICKS
  )
    throw new Error("Replay requires between 1 and 36,000 driving ticks.");
  const inputs = Array.from(source.inputs, (raw) => {
    const inputSource = object(
      raw,
      "Every replay tick requires a driving input.",
    );
    fields(
      inputSource,
      ["throttle", "brake", "steer", "nitro"],
      "Replay driving input contains invalid fields.",
    );
    const input = { ...inputSource } as RaceInput;
    validateInput(input);
    return input;
  });
  if (
    typeof source.finishTime !== "number" ||
    !Number.isFinite(source.finishTime) ||
    source.finishTime <= 0 ||
    source.finishTime > MAX_RACE_TICKS * DT
  )
    throw new Error("Finish time must be between 0 and 300 seconds.");
  if (
    typeof source.createdAt !== "string" ||
    source.createdAt.length > 32 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(
      source.createdAt,
    ) ||
    !Number.isFinite(Date.parse(source.createdAt))
  )
    throw new Error("Replay creation time must be a valid UTC date.");
  const canonicalDate = source.createdAt.includes(".")
    ? source.createdAt
    : source.createdAt.replace("Z", ".000Z");
  if (new Date(source.createdAt).toISOString() !== canonicalDate)
    throw new Error("Replay creation time contains an invalid calendar date.");
  return {
    version: 1,
    config,
    inputs,
    finishTime: source.finishTime,
    createdAt: source.createdAt,
  };
}

export function verifyReplay(payload: unknown): {
  valid: boolean;
  time: number;
  reason?: string;
  state?: RaceState;
} {
  try {
    const replay = validateReplay(payload);
    const state = createRace(replay.config);
    for (const input of replay.inputs) {
      if (state.finished)
        return {
          valid: false,
          time: state.time,
          reason: "Replay contains driving ticks after the finish.",
        };
      stepRace(state, input, replay.config);
    }
    if (!state.finished || state.finishTime === null)
      return {
        valid: false,
        time: state.time,
        reason: "Replay does not reach the finish line.",
      };
    if (state.finishTime !== replay.finishTime)
      return {
        valid: false,
        time: state.time,
        reason: "Claimed finish time does not match the driving replay.",
      };
    return { valid: true, time: state.finishTime, state };
  } catch (error) {
    return {
      valid: false,
      time: 0,
      reason:
        error instanceof Error
          ? error.message
          : "The replay could not be verified.",
    };
  }
}

export function replayFrames(payload: Replay): GhostFrame[] {
  const replay = validateReplay(payload);
  const state = createRace(replay.config);
  const frame = (): GhostFrame => ({
    distance: state.distance,
    lateral: state.lateral,
    speed: state.speed,
    airHeight: state.airHeight,
  });
  const frames = [frame()];
  for (const input of replay.inputs) {
    if (state.finished)
      throw new Error("Replay contains driving ticks after the finish.");
    stepRace(state, input, replay.config);
    frames.push(frame());
  }
  if (!state.finished || state.finishTime !== replay.finishTime)
    throw new Error("This replay does not contain a verified finish.");
  return frames;
}
