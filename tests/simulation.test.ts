import { describe, expect, it } from "vitest";
import {
  ASSISTS,
  CARS,
  COURSES,
  formatTime,
  getCar,
  getCourse,
  medalFor,
} from "../src/game/definitions";
import { getTrackPoints, sampleTrack, TRACK_LAYOUTS } from "../src/game/track";
import { createRace, DT, stepRace } from "../src/game/simulation";
import { replayFrames, validateReplay, verifyReplay } from "../src/game/replay";
import type { RaceConfig, RaceInput, Replay } from "../src/game/types";

const throttle: RaceInput = { throttle: 1, brake: 0, steer: 0, nitro: false };
function run(config: RaceConfig, nitro = false) {
  config = { revision: 2, ...config };
  const state = createRace(config);
  const inputs: RaceInput[] = [];
  while (!state.finished && state.tick < 36_000) {
    const input = { ...throttle, nitro };
    inputs.push(input);
    stepRace(state, input, config);
  }
  return { state, inputs };
}
function recording(): Replay {
  const config: RaceConfig = {
    courseId: "ignition",
    carId: "atelier",
    assist: "full",
    laps: getCourse("ignition").laps,
    revision: 2,
  };
  const { state, inputs } = run(config, true);
  return {
    version: 1,
    config,
    inputs,
    finishTime: state.finishTime!,
    createdAt: "2026-10-08T12:00:00.000Z",
  };
}

describe("continuous courses", () => {
  it.each(["ignition", "copper", "double", "neon", "skyline"] as const)(
    "%s separates the formerly intersecting lower loop branches by the full roadway width",
    (id) => {
      const layout = TRACK_LAYOUTS[id];
      let low = 0.001,
        high = Math.PI / 2;
      for (let i = 0; i < 70; i++) {
        const angle = (low + high) / 2;
        if (2 * layout.loopRadius * Math.sin(angle) + (6 * angle) / Math.PI > 6)
          high = angle;
        else low = angle;
      }
      const crossingHeight =
        layout.loopRadius * (1 - Math.cos((low + high) / 2));
      const crossingX =
        -layout.straight / 2 + layout.straight / (layout.loops + 1);
      const branches = getTrackPoints(id).filter(
        (point) =>
          Math.abs(point.center[0] - crossingX) < 0.3 &&
          Math.abs(point.center[1] - crossingHeight) < 0.3,
      );
      const rising = branches.find((point) => point.tangent[1] > 0.15)!;
      const falling = branches.find((point) => point.tangent[1] < -0.15)!;
      expect(rising).toBeDefined();
      expect(falling).toBeDefined();
      expect(
        Math.hypot(
          ...rising.center.map((value, axis) => value - falling.center[axis]),
        ),
      ).toBeGreaterThan(layout.width + 1);
    },
  );
  it.each(["ignition", "copper", "double", "neon", "skyline"] as const)(
    "%s closes with continuous orientation and inverted loops",
    (id) => {
      const points = getTrackPoints(id);
      expect(points.length).toBeGreaterThan(500);
      expect(points.some((p) => p.up[1] < -0.8)).toBe(true);
      const a = sampleTrack(id, 0);
      const b = sampleTrack(id, getCourse(id).length);
      expect(a.center).toEqual(b.center);
      for (const point of points) {
        expect(Math.hypot(...point.tangent)).toBeCloseTo(1, 7);
        expect(Math.hypot(...point.up)).toBeCloseTo(1, 7);
        expect(Math.hypot(...point.right)).toBeCloseTo(1, 7);
        expect(
          point.tangent.reduce((sum, value, i) => sum + value * point.up[i], 0),
        ).toBeCloseTo(0, 7);
      }
      for (let i = 1; i < points.length; i++) {
        expect(
          Math.hypot(
            ...points[i].center.map(
              (value, axis) => value - points[i - 1].center[axis],
            ),
          ),
        ).toBeLessThan(1.1);
        expect(
          points[i].up.reduce(
            (sum, value, axis) => sum + value * points[i - 1].up[axis],
            0,
          ),
        ).toBeGreaterThan(0.98);
      }
    },
  );
  it.each(["ignition", "copper", "double", "neon", "skyline"] as const)(
    "%s keeps all nonadjacent roadway sections clear including retaining lips",
    (id) => {
      const points = getTrackPoints(id),
        course = getCourse(id),
        distances = [0];
      for (let i = 1; i < points.length; i++)
        distances.push(
          distances[i - 1] +
            Math.hypot(
              ...points[i].center.map(
                (value, axis) => value - points[i - 1].center[axis],
              ),
            ),
        );
      // The molded profile reaches1.025×halfwidth and0.22m above the road.
      // One extra meter bounds the gap between samples along both swept sections.
      const clearance = 2 * Math.hypot((course.width * 1.025) / 2, 0.22) + 1;
      let minimum = Infinity;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const along = distances[j] - distances[i];
          if (Math.min(along, course.length - along) < course.width * 3)
            continue;
          const gap = Math.hypot(
            ...points[i].center.map(
              (value, axis) => value - points[j].center[axis],
            ),
          );
          minimum = Math.min(minimum, gap);
        }
      }
      expect(minimum).toBeGreaterThan(clearance);
      for (const point of points.filter((point) => point.up[1] < -0.5))
        expect(point.curvature).toBeGreaterThan(
          1 / (TRACK_LAYOUTS[id].loopRadius * 1.5),
        );
    },
  );
});

describe("fixed-step races", () => {
  for (const courseId of [
    "ignition",
    "copper",
    "double",
    "neon",
    "skyline",
  ] as const) {
    for (const carId of ["atelier", "comet", "apex", "titan"] as const) {
      for (const assist of ["full", "balanced", "off"] as const) {
        it(`${courseId}/${carId}/${assist} finishes within five minutes`, () => {
          const config = {
            courseId,
            carId,
            assist,
            laps: getCourse(courseId).laps,
          };
          const { state } = run(config);
          expect(state.finished).toBe(true);
          expect(state.finishTime).toBe(state.tick * DT);
          expect(state.distance).toBe(getCourse(courseId).length * config.laps);
          expect(state.lap).toBe(config.laps);
          if (assist === "full") expect(state.crashes).toBe(0);
        });
      }
    }
  }
  it("is identical when ticks are grouped into different render frame sizes", () => {
    const config: RaceConfig = {
      courseId: "double",
      carId: "apex",
      assist: "balanced",
      laps: 2,
    };
    const a = createRace(config),
      b = createRace(config);
    for (let tick = 0; tick < 2400; tick++)
      stepRace(
        a,
        {
          ...throttle,
          steer: Math.sin(tick / 200) * 0.5,
          nitro: tick % 600 < 200,
        },
        config,
      );
    for (let frame = 0; frame < 400; frame++) {
      for (let step = 0; step < 6; step++) {
        const tick = frame * 6 + step;
        stepRace(
          b,
          {
            ...throttle,
            steer: Math.sin(tick / 200) * 0.5,
            nitro: tick % 600 < 200,
          },
          config,
        );
      }
    }
    expect(b).toEqual(a);
  });
  it.each(["atelier", "comet", "apex", "titan"] as const)(
    "nitro improves %s time",
    (carId) => {
      const config: RaceConfig = {
        courseId: "ignition",
        carId,
        assist: "full",
        laps: getCourse("ignition").laps,
      };
      expect(run(config, true).state.finishTime!).toBeLessThan(
        run(config).state.finishTime!,
      );
    },
  );
  it("zero throttle stays at rest and braking decreases speed", () => {
    const config: RaceConfig = {
      courseId: "ignition",
      carId: "atelier",
      assist: "full",
      laps: 2,
    };
    const state = createRace(config);
    for (let i = 0; i < 120; i++)
      stepRace(state, { ...throttle, throttle: 0 }, config);
    expect(state.distance).toBe(0);
    for (let i = 0; i < 120; i++) stepRace(state, throttle, config);
    const speed = state.speed;
    for (let i = 0; i < 30; i++)
      stepRace(state, { ...throttle, throttle: 0, brake: 1 }, config);
    expect(state.speed).toBeLessThan(speed);
  });
  it("catalog lookups reject invalid identifiers", () => {
    expect(() => getCar("unknown" as never)).toThrow();
    expect(() => getCourse("unknown" as never)).toThrow();
    expect(CARS).toHaveLength(4);
    expect(COURSES).toHaveLength(5);
    expect(ASSISTS).toHaveLength(3);
    expect(medalFor(getCourse("ignition"), 1)).toBe("gold");
  });
  it("formats minute rollover and refuses medals for invalid times", () => {
    expect(formatTime(59.9996)).toBe("1:00.000");
    expect(formatTime(0)).toBe("0:00.000");
    expect(medalFor(getCourse("ignition"), -1)).toBe("finish");
    expect(medalFor(getCourse("ignition"), Infinity)).toBe("finish");
  });
  it("a recovered clean line earns nitro after a collision", () => {
    const config: RaceConfig = {
      courseId: "ignition",
      carId: "atelier",
      assist: "full",
      laps: 2,
    };
    const state = createRace(config);
    state.speed = 15;
    state.nitro = 0;
    state.lateral = 20;
    stepRace(state, throttle, config);
    expect(state.crashes).toBe(1);
    const nitro = state.nitro;
    for (let i = 0; i < 90; i++) stepRace(state, throttle, config);
    expect(state.skills.recovery).toBe(1);
    expect(state.nitro).toBeGreaterThan(nitro + 5);
  });
  it.each(["full", "balanced", "off"] as const)(
    "recovers a stalled inverted car with %s assists",
    (assist) => {
      const config: RaceConfig = {
        courseId: "ignition",
        carId: "titan",
        assist,
        laps: 2,
      };
      const state = createRace(config);
      let invertedDistance = 0;
      while (sampleTrack("ignition", invertedDistance).up[1] > -0.9)
        invertedDistance += 0.25;
      state.distance = invertedDistance;
      stepRace(state, throttle, config);
      expect(state.distance).toBeLessThan(invertedDistance);
      while (!state.finished && state.tick < 10_000)
        stepRace(state, throttle, config);
      expect(state.finished).toBe(true);
    },
  );
});

describe("replay integrity", () => {
  it("verifies old unversioned replays using the original geometry and refuses reinterpretation as revision 2", () => {
    const config = {
      courseId: "ignition",
      carId: "atelier",
      assist: "full",
      laps: 2,
      revision: 1,
    } as const;
    const { state, inputs } = run(config);
    const { revision: _revision, ...originalConfig } = config;
    const legacy = {
      version: 1,
      config: originalConfig,
      inputs,
      finishTime: state.finishTime!,
      createdAt: "2026-10-08T12:00:00.000Z",
    };
    expect(validateReplay(legacy).config.revision).toBe(1);
    expect(verifyReplay(legacy).valid).toBe(true);
    expect(
      verifyReplay({ ...legacy, config: { ...originalConfig, revision: 2 } })
        .valid,
    ).toBe(false);
    expect(getCourse("ignition", 1).length).toBeCloseTo(352.738, 1);
    expect(getCourse("ignition", 2).length).toBeGreaterThan(
      getCourse("ignition", 1).length,
    );
  });
  it("verifies an honest race and provides a ghost frame for every tick", () => {
    const replay = recording();
    const result = verifyReplay(replay);
    expect(result.valid).toBe(true);
    expect(result.time).toBe(replay.finishTime);
    const frames = replayFrames(replay);
    expect(frames).toHaveLength(replay.inputs.length + 1);
    expect(frames[0].distance).toBe(0);
    expect(frames.at(-1)!.distance).toBe(result.state!.distance);
  });
  it("rejects changed claimed time, shortened and post-finish inputs", () => {
    const replay = recording();
    expect(
      verifyReplay({ ...replay, finishTime: replay.finishTime - 1 }).valid,
    ).toBe(false);
    expect(
      verifyReplay({ ...replay, inputs: replay.inputs.slice(0, -1) }).valid,
    ).toBe(false);
    expect(
      verifyReplay({ ...replay, inputs: [...replay.inputs, throttle] }).valid,
    ).toBe(false);
    expect(() =>
      replayFrames({ ...replay, finishTime: replay.finishTime - 1 }),
    ).toThrow();
    expect(() =>
      replayFrames({ ...replay, inputs: [...replay.inputs, throttle] }),
    ).toThrow();
  });
  it.each([
    { version: 2 },
    { finishTime: Number.NaN },
    { inputs: [{ ...throttle, steer: Infinity }] },
    { inputs: [{ ...throttle, throttle: 2 }] },
    { inputs: [{ ...throttle, nitro: 1 }] },
    {
      config: {
        courseId: "unknown",
        carId: "atelier",
        assist: "full",
        laps: 2,
      },
    },
    {
      config: {
        courseId: "ignition",
        carId: "atelier",
        assist: "robot",
        laps: 2,
      },
    },
    {
      config: {
        courseId: "ignition",
        carId: "atelier",
        assist: "full",
        laps: 3,
      },
    },
    { inputs: Array(36_001).fill(throttle) },
    { inputs: Array(100) },
    { createdAt: "2026-02-31T12:00:00.000Z" },
    ...[0, 3, null, "2"].map((revision) => ({
      config: {
        courseId: "ignition",
        carId: "atelier",
        assist: "full",
        laps: 2,
        revision,
      },
    })),
  ])("rejects invalid payload %j", (patch) => {
    expect(() => validateReplay({ ...recording(), ...patch })).toThrow();
    expect(verifyReplay({ ...recording(), ...patch }).valid).toBe(false);
  });
});
