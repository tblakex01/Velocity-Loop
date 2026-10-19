import { describe, expect, it } from "vitest";
import { parseImportedRecord, recordKey } from "../src/persistence";
import { createRace, stepRace } from "../src/game/simulation";
import { getCourse } from "../src/game/definitions";
import type { Replay } from "../src/game/types";

const config = {
  courseId: "ignition",
  carId: "atelier",
  assist: "full",
  laps: getCourse("ignition").laps,
  revision: 2,
} as const;
function fixture(): Replay {
  const state = createRace(config),
    inputs = [];
  while (!state.finished) {
    const input = { throttle: 1, brake: 0, steer: 0, nitro: false };
    inputs.push(input);
    stepRace(state, input, config);
  }
  return {
    version: 1,
    config,
    inputs,
    finishTime: state.finishTime!,
    createdAt: "2026-10-08T17:00:00.000Z",
  };
}
describe("record import invariants", () => {
  it("preserves genuine replays and removes imported ranking eligibility", () => {
    const replay = fixture();
    const record = parseImportedRecord({
      config,
      time: replay.finishTime,
      replay,
      eligible: true,
    });
    expect(record.eligible).toBe(false);
    expect(record.replay?.inputs.length).toBe(replay.inputs.length);
    expect(record.time).toBe(replay.finishTime);
  });
  it("preserves an older ghost without treating it as a current input replay", () => {
    const replay = { version: 0, positions: [{ time: 1, x: 3, y: 0, z: 2 }] };
    const record = parseImportedRecord({ config, time: 42, replay });
    expect(record.replay).toBeNull();
    expect(record.archivedReplay).toEqual(replay);
    expect(record.eligible).toBe(false);
  });
  it("refuses mismatched record and replay clocks", () => {
    const replay = fixture();
    expect(() => parseImportedRecord({ config, time: 1, replay })).toThrow(
      "disagree",
    );
  });
  it("refuses an impossible one-tick imported best", () => {
    const replay = fixture();
    replay.inputs = replay.inputs.slice(0, 1);
    replay.finishTime = 1;
    expect(() => parseImportedRecord({ config, time: 1, replay })).toThrow(
      "finish line",
    );
  });
  it("refuses invalid canonical inputs", () => {
    for (const candidate of [
      null,
      { config, time: NaN },
      { config: { ...config, laps: 1 }, time: 40 },
      { config: { ...config, carId: "injected" }, time: 40 },
      { config: { ...config, assist: "autowin" }, time: 40 },
    ])
      expect(() => parseImportedRecord(candidate)).toThrow();
  });
  it("keeps record categories separated by car and assist", () => {
    expect(recordKey(config)).not.toBe(recordKey({ ...config, revision: 1 }));
    expect(recordKey(config)).not.toBe(
      recordKey({ ...config, carId: "comet" }),
    );
    expect(recordKey(config)).not.toBe(recordKey({ ...config, assist: "off" }));
  });
});
