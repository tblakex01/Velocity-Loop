import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GhostFrame,
  RaceConfig,
  RaceState,
  Replay,
} from "../src/game/types";
import { createRace, DT, stepRace } from "../src/game/simulation";
import { verifyReplay } from "../src/game/replay";
import { GameRuntime, type Snapshot } from "../src/runtime";

type RenderFrame = { state: RaceState | null; ghost: GhostFrame | null };
const rendering = vi.hoisted(() => ({
  frames: [] as RenderFrame[],
  reportStatus: (_status: string) => {},
}));

vi.mock("../src/render/GameRenderer", () => ({
  GameRenderer: class {
    constructor(_container: HTMLElement, status: (value: string) => void) {
      rendering.reportStatus = status;
    }
    setCourse() {}
    setCar() {}
    setMode() {}
    setCamera() {}
    setQuality() {}
    getCarPortraits() {
      return {};
    }
    update(state: RaceState | null, _dt: number, ghost: GhostFrame | null) {
      rendering.frames.push(structuredClone({ state, ghost }));
    }
    dispose() {}
  },
}));
vi.mock("../src/audio", () => ({
  RaceAudio: class {
    enabled = true;
    unlock() {}
    chime() {}
    update() {}
    dispose() {}
  },
}));

const config: RaceConfig = {
  courseId: "ignition",
  carId: "atelier",
  assist: "full",
  laps: 2,
  revision: 2,
};
const throttle = { throttle: 1, brake: 0, steer: 0, nitro: false };
let runtime: GameRuntime;
let snapshot: Snapshot;
let clock: number;
let nextFrameId: number;
let callbacks: Map<number, FrameRequestCallback>;
let pad: {
  connected: boolean;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
};

function frame(milliseconds = 100) {
  clock += milliseconds;
  const pending = [...callbacks.values()];
  callbacks.clear();
  for (const callback of pending) callback(clock);
}
function button(index: number, pressed: boolean) {
  pad.buttons[index] = { pressed, value: pressed ? 1 : 0 };
}
function start(ghost?: Replay) {
  runtime.start(config, ghost);
}
function race() {
  start();
  button(7, true);
  for (let i = 0; i < 40 && snapshot.phase === "countdown"; i++) frame();
  expect(snapshot.phase).toBe("racing");
}
function rendered() {
  return rendering.frames.at(-1)!;
}
function genuineGhost(): Replay {
  const state = createRace(config),
    inputs = [];
  while (!state.finished) {
    inputs.push({ ...throttle });
    stepRace(state, throttle, config);
  }
  return {
    version: 1,
    config,
    inputs,
    finishTime: state.finishTime!,
    createdAt: "2026-10-08T12:00:00.000Z",
  };
}

beforeEach(() => {
  rendering.frames.length = 0;
  callbacks = new Map();
  clock = 1;
  nextFrameId = 0;
  pad = {
    connected: true,
    axes: [0],
    buttons: Array.from({ length: 10 }, () => ({ pressed: false, value: 0 })),
  };
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { hidden: false }),
  );
  vi.stubGlobal("navigator", { getGamepads: () => [pad] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrameId;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  runtime = new GameRuntime({} as HTMLElement, config);
  runtime.onSnapshot = (value) => {
    snapshot = value;
  };
});

describe("simultaneous touch input", () => {
  it("combines independent accelerator, steering and nitro pointers and releases each independently", () => {
    start();
    runtime.input.touch(17, "throttle");
    runtime.input.touch(18, "right");
    runtime.input.touch(19, "nitro");
    expect(runtime.input.read()).toEqual({
      throttle: 1,
      brake: 0,
      steer: 1,
      nitro: true,
    });

    runtime.input.release(18);
    expect(runtime.input.read()).toEqual({
      throttle: 1,
      brake: 0,
      steer: 0,
      nitro: true,
    });
    runtime.input.release(17);
    expect(runtime.input.read()).toEqual({
      throttle: 0,
      brake: 0,
      steer: 0,
      nitro: true,
    });
    runtime.input.release(19);
    expect(runtime.input.read()).toEqual({
      throttle: 0,
      brake: 0,
      steer: 0,
      nitro: false,
    });
  });

  it("window blur clears all held touch pointers and keyboard keys", () => {
    start();
    window.dispatchEvent(
      Object.assign(new Event("keydown"), { code: "KeyW", repeat: false }),
    );
    expect(runtime.input.read().throttle).toBe(1);
    runtime.input.touch(17, "throttle");
    runtime.input.touch(18, "right");
    runtime.input.touch(19, "nitro");
    expect(runtime.input.read()).toEqual({
      throttle: 1,
      brake: 0,
      steer: 1,
      nitro: true,
    });

    window.dispatchEvent(new Event("blur"));
    expect(runtime.input.read()).toEqual({
      throttle: 0,
      brake: 0,
      steer: 0,
      nitro: false,
    });
    runtime.input.release(17);
    runtime.input.release(18);
    runtime.input.release(19);
    expect(runtime.input.read()).toEqual({
      throttle: 0,
      brake: 0,
      steer: 0,
      nitro: false,
    });
  });
});
afterEach(() => {
  runtime.dispose();
  vi.unstubAllGlobals();
});

describe("runtime action boundaries", () => {
  it("keeps menu and paused snapshots idle while publishing explicit changes", () => {
    const publish = vi.fn((value: Snapshot) => {
      snapshot = value;
    });
    runtime.onSnapshot = publish;
    for (let i = 0; i < 10; i++) frame();
    expect(publish).not.toHaveBeenCalled();
    race();
    runtime.pause();
    expect(snapshot.phase).toBe("paused");
    publish.mockClear();
    for (let i = 0; i < 10; i++) frame();
    expect(publish).not.toHaveBeenCalled();
    runtime.cycleCamera();
    expect(publish).toHaveBeenCalledOnce();
    expect(snapshot.camera).toBe("hood");
    runtime.home();
    expect(snapshot.phase).toBe("menu");
    publish.mockClear();
    for (let i = 0; i < 10; i++) frame();
    expect(publish).not.toHaveBeenCalled();
    rendering.reportStatus("Graphics restored");
    expect(publish).toHaveBeenCalledOnce();
    expect(snapshot.status).toBe("Graphics restored");
  });
  it("does not advance any simulation ticks after gamepad pause inside input.read", () => {
    race();
    const before = rendered().state!;
    button(9, true);
    frame();
    expect(snapshot.phase).toBe("paused");
    expect(rendered().state!.tick).toBe(before.tick);
    expect(rendered().state!.distance).toBe(before.distance);
    frame();
    expect(rendered().state!.time).toBe(before.time);
  });
  it("publishes the five-minute limit immediately before the race becomes idle", () => {
    start();
    for (let i = 0; i < 3100 && snapshot.phase !== "paused"; i++) frame();
    expect(snapshot.phase).toBe("paused");
    expect(snapshot.state!.tick).toBe(36000);
    expect(snapshot.status).toContain("Five-minute race limit");
    const publish = vi.fn();
    runtime.onSnapshot = publish;
    frame();
    expect(publish).not.toHaveBeenCalled();
  });
  it("does not advance the replacement race when gamepad retry occurs inside input.read", () => {
    race();
    expect(rendered().state!.tick).toBeGreaterThan(0);
    button(2, true);
    frame();
    expect(snapshot.phase).toBe("countdown");
    expect(rendered().state!.tick).toBe(0);
    expect(rendered().state!.distance).toBe(0);
    expect(snapshot.countdown).toBe(3);
  });
  it("does not catch up the discarded pause-trigger frame when gamepad resumes", () => {
    race();
    const before = rendered().state!.time;
    button(9, true);
    frame();
    button(9, false);
    frame();
    button(9, true);
    frame();
    expect(snapshot.phase).toBe("racing");
    expect(rendered().state!.time - before).toBeLessThanOrEqual(0.1 + DT / 2);
  });
  it("polls gamepad pause during countdown and resumes the countdown without driving", () => {
    start();
    button(9, true);
    frame();
    expect(snapshot.phase).toBe("paused");
    expect(snapshot.countdown).toBe(3);
    expect(rendered().state!.tick).toBe(0);
    button(9, false);
    frame();
    button(9, true);
    frame();
    expect(snapshot.phase).toBe("countdown");
    expect(rendered().state!.tick).toBe(0);
  });
  it("context loss while manually paused keeps the race paused", () => {
    race();
    runtime.pause();
    const before = snapshot.state!.tick;
    rendering.reportStatus("WebGL context lost · graphics paused");
    expect(snapshot.phase).toBe("paused");
    frame();
    expect(rendered().state!.tick).toBe(before);
  });
  it("context loss during racing pauses before the next tick", () => {
    race();
    const before = rendered().state!.tick;
    rendering.reportStatus("WebGL context lost · graphics paused");
    expect(snapshot.phase).toBe("paused");
    frame();
    expect(rendered().state!.tick).toBe(before);
  });
  it("preserves the active ghost when the default retry action starts a replacement race", () => {
    const ghost = genuineGhost();
    start(ghost);
    frame();
    expect(runtime.hasGhost()).toBe(true);
    expect(rendered().ghost).not.toBeNull();
    button(2, true);
    frame();
    expect(snapshot.phase).toBe("countdown");
    expect(runtime.hasGhost()).toBe(true);
    expect(rendered().ghost).toEqual({
      distance: 0,
      lateral: 0,
      speed: 0,
      airHeight: 0,
    });
  });
  it("routes retry through the app callback so it can restore the selected personal-best ghost", () => {
    const ghost = genuineGhost();
    let retries = 0;
    runtime.onRetry = () => {
      retries++;
      runtime.start(config, ghost);
    };
    race();
    button(2, true);
    frame();
    expect(retries).toBe(1);
    expect(runtime.hasGhost()).toBe(true);
    expect(rendered().state!.tick).toBe(0);
    expect(rendered().ghost!.distance).toBe(0);
  });
  it("renders the ghost at the exact simulated tick rather than the next or previous tick", () => {
    start(genuineGhost());
    button(7, true);
    for (let i = 0; i < 40 && snapshot.phase === "countdown"; i++) frame();
    for (let i = 0; i < 6; i++) {
      frame();
      const current = rendered();
      expect(current.ghost!.distance).toBe(current.state!.distance);
      expect(current.ghost!.speed).toBe(current.state!.speed);
      expect(current.ghost!.airHeight).toBe(current.state!.airHeight);
    }
  });
  it("refuses a corrupted ghost without advertising an active ghost", () => {
    const ghost = genuineGhost();
    start({ ...ghost, finishTime: ghost.finishTime - 1 });
    frame();
    expect(runtime.hasGhost()).toBe(false);
    expect(rendered().ghost).toBeNull();
    expect(snapshot.status).toContain("cannot race");
  });
  it("records exactly the simulated ticks and invokes finish once with a verifiable replay", () => {
    let finishes = 0;
    let replay: Replay | undefined;
    runtime.onFinish = (value) => {
      finishes++;
      replay = value;
    };
    race();
    for (let i = 0; i < 700 && snapshot.phase !== "finished"; i++) frame();
    expect(snapshot.phase).toBe("finished");
    expect(finishes).toBe(1);
    expect(replay!.inputs).toHaveLength(snapshot.state!.tick);
    expect(replay!.finishTime).toBe(snapshot.state!.tick * DT);
    expect(verifyReplay(replay).valid).toBe(true);
    const publish = vi.fn();
    runtime.onSnapshot = publish;
    frame();
    frame();
    expect(finishes).toBe(1);
    expect(publish).not.toHaveBeenCalled();
  });
});
