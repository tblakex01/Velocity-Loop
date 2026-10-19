import {
  CURRENT_REVISION,
  getCar,
  getCourse,
  validateConfig,
} from "./definitions";
import { sampleTrack } from "./track";
import type { RaceConfig, RaceInput, RaceState } from "./types";

export const DT = 1 / 120;
export const MAX_RACE_TICKS = 120 * 300;
const GRAVITY = 9.81;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function validateInput(input: RaceInput): void {
  if (!input || typeof input !== "object")
    throw new Error("Each replay tick requires a driving input.");
  for (const key of ["throttle", "brake", "steer"] as const) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`${key} must be a finite number.`);
    if (value < (key === "steer" ? -1 : 0) || value > 1)
      throw new Error(`${key} is outside its driving range.`);
  }
  if (typeof input.nitro !== "boolean")
    throw new Error("Nitro input must be true or false.");
}

export function createRace(config: RaceConfig): RaceState {
  validateConfig(config);
  return {
    tick: 0,
    time: 0,
    distance: 0,
    speed: 0,
    lateral: 0,
    lateralVelocity: 0,
    nitro: 100,
    boosting: false,
    lap: 1,
    finished: false,
    finishTime: null,
    crashes: 0,
    airborne: 0,
    airHeight: 0,
    airVelocity: 0,
    event: "Find your rhythm",
    eventTicks: 240,
    skills: { drift: 0, clean: 0, boosts: 0, braking: 0, recovery: 0 },
  };
}

function event(state: RaceState, message: string) {
  state.event = message;
  state.eventTicks = 180;
}

function loopApproach(
  config: RaceConfig,
  distance: number,
  courseLength: number,
): number {
  const lapStart = Math.floor(distance / courseLength) * courseLength;
  for (let back = 0.75; back <= 90; back += 0.75) {
    const candidate = Math.max(lapStart, distance - back);
    const sample = sampleTrack(
      config.courseId,
      candidate,
      config.revision ?? CURRENT_REVISION,
    );
    if (
      sample.up[1] > 0.98 &&
      Math.abs(sample.tangent[1]) < 0.05 &&
      sample.center[1] < 0.1
    )
      return Math.max(lapStart, candidate - 12);
  }
  return lapStart;
}

/** The browser and server both call this exact fixed-step simulation. */
export function stepRace(
  state: RaceState,
  input: RaceInput,
  config: RaceConfig,
): void {
  if (state.finished) return;
  validateInput(input);
  const car = getCar(config.carId);
  const revision = config.revision ?? CURRENT_REVISION;
  const course = getCourse(config.courseId, revision);
  const track = sampleTrack(config.courseId, state.distance, revision);
  const curvature = Math.abs(track.curvature);
  const onLoop = track.up[1] < 0.75 || Math.abs(track.tangent[1]) > 0.45;
  const assistStrength =
    config.assist === "full" ? 1 : config.assist === "balanced" ? 0.4 : 0;
  const wasBoosting = state.boosting;
  state.boosting =
    input.nitro &&
    state.nitro >= (wasBoosting ? 0.3 : 8) &&
    input.throttle > 0 &&
    input.brake < 0.5;
  if (state.boosting && !wasBoosting) {
    state.skills.boosts++;
    event(state, "Nitro engaged");
  }
  const speedLimit = car.speed * (state.boosting ? car.nitro : 1);
  const motor =
    input.throttle *
    (1 - input.brake) *
    car.acceleration *
    (state.boosting ? 1.5 : 1);
  const drag = car.acceleration * 0.45 * (state.speed / speedLimit) ** 2;
  const drivetrainFalloff = motor * 0.55 * (state.speed / speedLimit) ** 2;
  const cornerDrag = onLoop
    ? 0
    : (curvature * state.speed ** 2 * (0.035 + Math.abs(input.steer) * 0.025)) /
      car.grip;
  const acceleration =
    motor -
    drivetrainFalloff -
    drag -
    cornerDrag -
    input.brake * car.braking -
    GRAVITY * track.tangent[1];
  state.speed = clamp(state.speed + acceleration * DT, 0, speedLimit * 1.15);

  // Grip resists centrifugal drift; steering remains available in every mode.
  const outwardForce = onLoop
    ? 0
    : -track.curvature * state.speed ** 2 * 0.16 +
      Math.sin(track.bank) * GRAVITY * 0.18;
  const steerForce =
    input.steer * state.speed * (config.assist === "full" ? 0.72 : 1.2);
  const centering = state.lateral * (assistStrength * 8 + 0.25);
  const assistedTurn = -outwardForce * assistStrength;
  const lateralAcceleration =
    outwardForce +
    assistedTurn +
    steerForce -
    centering -
    state.lateralVelocity * (car.grip * 2.2 + assistStrength * 4);
  state.lateralVelocity += lateralAcceleration * DT;
  state.lateral += state.lateralVelocity * DT;

  const edge = course.width / 2 - 0.4;
  const losingLoopContact =
    onLoop &&
    track.up[1] < -0.5 &&
    state.speed ** 2 * curvature <
      GRAVITY * -track.up[1] * (1 - assistStrength * 0.75);
  const stalledLoop =
    onLoop &&
    track.tangent[1] > 0.6 &&
    state.speed < 0.8 &&
    input.throttle > 0.5;
  if (Math.abs(state.lateral) > edge || losingLoopContact || stalledLoop) {
    state.crashes++;
    state.speed *= losingLoopContact || stalledLoop ? 0.72 : 0.6;
    state.lateral = 0;
    state.lateralVelocity = 0;
    state.nitro = Math.max(0, state.nitro - 12);
    if (losingLoopContact || stalledLoop) {
      state.distance = loopApproach(config, state.distance, course.length);
      state.airborne = 0;
      state.airHeight = 0;
      state.airVelocity = 0;
    }
    event(
      state,
      losingLoopContact || stalledLoop
        ? "Loop recovery · build more speed"
        : "Recovery · find a clean line",
    );
  }

  if (track.jump && state.airborne === 0 && state.speed > 10) {
    state.airborne = DT;
    state.airHeight = 0.025;
    state.airVelocity = state.speed * 0.18;
    event(state, "Air time");
  } else if (state.airborne > 0) {
    state.airborne += DT;
    state.airVelocity -= GRAVITY * DT;
    state.airHeight += state.airVelocity * DT;
    if (state.airHeight <= 0) {
      state.airborne = 0;
      state.airHeight = 0;
      state.airVelocity = 0;
      state.nitro = Math.min(100, state.nitro + 5);
      event(state, "Clean landing · +5 nitro");
    }
  }

  const drifting =
    Math.abs(input.steer) > 0.25 &&
    state.speed > 10 &&
    Math.abs(state.lateralVelocity) > 0.6 &&
    Math.abs(state.lateral) < edge * 0.9;
  const clean =
    Math.abs(state.lateral) < edge * 0.55 &&
    input.brake < 0.2 &&
    state.speed > 8;
  const preciseBraking =
    input.brake > 0.15 && state.speed > 7 && curvature > 0.025 && !onLoop;
  if (drifting) {
    const previous = state.skills.drift;
    state.skills.drift += DT;
    if (Math.floor(previous) !== Math.floor(state.skills.drift))
      event(state, "Controlled drift · nitro earned");
  }
  if (preciseBraking) {
    const previous = state.skills.braking;
    state.skills.braking += DT;
    if (Math.floor(previous) !== Math.floor(state.skills.braking))
      event(state, "Precision braking · nitro earned");
  }
  if (clean) {
    state.skills.clean += DT;
    if (state.skills.recovery < state.crashes && state.eventTicks <= 120) {
      state.skills.recovery++;
      state.nitro = Math.min(100, state.nitro + 6);
      event(state, "Clean recovery · +6 nitro");
    }
  }
  const recharge = state.boosting
    ? -28
    : (clean ? 3.8 : 0.9) + (drifting ? 8 : 0) + (preciseBraking ? 7 : 0);
  state.nitro = clamp(state.nitro + recharge * DT, 0, 100);

  state.tick++;
  state.time = state.tick * DT;
  if (state.eventTicks > 0) state.eventTicks--;
  state.distance = Math.min(
    course.length * config.laps,
    state.distance + state.speed * DT,
  );
  const lap = Math.min(
    config.laps,
    Math.floor(state.distance / course.length) + 1,
  );
  if (lap > state.lap) event(state, `Lap ${lap} · keep your rhythm`);
  state.lap = lap;
  if (state.distance >= course.length * config.laps) {
    state.finished = true;
    state.finishTime = state.time;
    state.boosting = false;
    event(state, "Finish · beautifully driven");
  }
}
