export type Vec3 = [number, number, number];
export type Assist = "full" | "balanced" | "off";
export type CarId = "atelier" | "comet" | "apex" | "titan";
export type CourseId = "ignition" | "copper" | "double" | "neon" | "skyline";
export type TrackRevision = 1 | 2;
export const CURRENT_REVISION: TrackRevision = 2;
export type RaceInput = {
  throttle: number;
  brake: number;
  steer: number;
  nitro: boolean;
};
export type RaceConfig = {
  courseId: CourseId;
  carId: CarId;
  assist: Assist;
  laps: number;
  revision?: TrackRevision;
};
export type CarDefinition = {
  id: CarId;
  name: string;
  subtitle: string;
  color: string;
  accent: string;
  speed: number;
  acceleration: number;
  grip: number;
  braking: number;
  nitro: number;
  body: "gt" | "compact" | "wedge" | "muscle";
};
export type CourseDefinition = {
  id: CourseId;
  name: string;
  subtitle: string;
  difficulty: number;
  loops: number;
  jumps: number;
  length: number;
  width: number;
  laps: number;
  medals: [number, number, number];
  color: string;
};
export type TrackSample = {
  center: Vec3;
  tangent: Vec3;
  up: Vec3;
  right: Vec3;
  curvature: number;
  bank: number;
  width: number;
  jump: boolean;
};
export type SkillStats = {
  drift: number;
  clean: number;
  boosts: number;
  braking: number;
  recovery: number;
};
export type RaceState = {
  tick: number;
  time: number;
  distance: number;
  speed: number;
  lateral: number;
  lateralVelocity: number;
  nitro: number;
  boosting: boolean;
  lap: number;
  finished: boolean;
  finishTime: number | null;
  crashes: number;
  airborne: number;
  airHeight: number;
  airVelocity: number;
  event: string;
  eventTicks: number;
  skills: SkillStats;
};
export type InputFrame = RaceInput;
export type Replay = {
  version: 1;
  config: RaceConfig;
  inputs: InputFrame[];
  finishTime: number;
  createdAt: string;
};
export type GhostFrame = {
  distance: number;
  lateral: number;
  speed: number;
  airHeight: number;
};
export type LocalRecord = {
  config: RaceConfig;
  time: number;
  medal: string;
  replay: Replay | null;
  eligible: boolean;
  archivedReplay?: unknown;
};
