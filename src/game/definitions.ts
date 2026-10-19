import { TRACK_LAYOUTS, trackLength } from "./track";
import { CURRENT_REVISION } from "./types";
export { CURRENT_REVISION } from "./types";
import type {
  Assist,
  CarDefinition,
  CarId,
  CourseDefinition,
  CourseId,
  RaceConfig,
  TrackRevision,
} from "./types";

export const CARS: CarDefinition[] = [
  {
    id: "atelier",
    name: "Atelier GT",
    subtitle: "Sculpted mid-engine GT",
    color: "#185fc9",
    accent: "#ecebe4",
    speed: 22,
    acceleration: 9.2,
    grip: 1.05,
    braking: 20,
    nitro: 1.3,
    body: "gt",
  },
  {
    id: "comet",
    name: "Comet Sprint",
    subtitle: "Lightweight targa roadster",
    color: "#65d7be",
    accent: "#f5f1d6",
    speed: 21,
    acceleration: 11.2,
    grip: 1.15,
    braking: 21,
    nitro: 1.26,
    body: "compact",
  },
  {
    id: "apex",
    name: "Apex Needle",
    subtitle: "Long-tail aero prototype",
    color: "#9261e3",
    accent: "#e5e2ff",
    speed: 24.5,
    acceleration: 8.8,
    grip: 1.26,
    braking: 23,
    nitro: 1.32,
    body: "wedge",
  },
  {
    id: "titan",
    name: "Titan RS",
    subtitle: "Wide-body retro coupe",
    color: "#ce4e3b",
    accent: "#f3d9c1",
    speed: 23.8,
    acceleration: 7.9,
    grip: 0.92,
    braking: 18,
    nitro: 1.4,
    body: "muscle",
  },
];

export const ASSISTS: { id: Assist; label: string; description: string }[] = [
  {
    id: "full",
    label: "Full assist",
    description: "Auto steering + stability",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Light steering support",
  },
  {
    id: "off",
    label: "Assists off",
    description: "Complete manual control",
  },
];

const course = (
  id: CourseId,
  name: string,
  subtitle: string,
  difficulty: number,
  laps: number,
  medals: [number, number, number],
  color: string,
): CourseDefinition => ({
  id,
  name,
  subtitle,
  difficulty,
  laps,
  medals,
  color,
  length: trackLength(id),
  loops: TRACK_LAYOUTS[id].loops,
  jumps: TRACK_LAYOUTS[id].jumps,
  width: TRACK_LAYOUTS[id].width,
});
export const COURSES: CourseDefinition[] = [
  course(
    "ignition",
    "Ignition",
    "A generous opening. One unforgettable loop.",
    1,
    2,
    [34, 40, 49],
    "#d76c3b",
  ),
  course(
    "copper",
    "Copper Circuit",
    "Banked copper turns and a flying finish.",
    2,
    2,
    [32, 38, 46],
    "#c78b56",
  ),
  course(
    "double",
    "Double Helix",
    "Two inversions. One perfect rhythm.",
    3,
    2,
    [41, 49, 60],
    "#9eab75",
  ),
  course(
    "neon",
    "Neon Ribbon",
    "Twin jumps. Long straights. Electric momentum.",
    4,
    2,
    [52, 63, 77],
    "#9d95c9",
  ),
  course(
    "skyline",
    "Skyline",
    "Three loops above a miniature world.",
    5,
    1,
    [34, 41, 51],
    "#589aab",
  ),
];

export function getCar(id: CarId): CarDefinition {
  const car = CARS.find((entry) => entry.id === id);
  if (!car) throw new Error("Choose a valid car.");
  return car;
}
const legacyCourses = COURSES.map((selected) => ({
  ...selected,
  length: trackLength(selected.id, 1),
}));

export function getCourse(
  id: CourseId,
  revision: TrackRevision = CURRENT_REVISION,
): CourseDefinition {
  if (revision !== 1 && revision !== 2)
    throw new Error("Choose a supported track revision.");
  const selected = (revision === 1 ? legacyCourses : COURSES).find(
    (entry) => entry.id === id,
  );
  if (!selected) throw new Error("Choose a valid course.");
  return selected;
}
export function validateConfig(config: RaceConfig): void {
  if (!config || typeof config !== "object")
    throw new Error("Race configuration is required.");
  if (
    config.revision !== undefined &&
    config.revision !== 1 &&
    config.revision !== 2
  )
    throw new Error("Choose a supported track revision.");
  getCar(config.carId);
  const selected = getCourse(
    config.courseId,
    config.revision ?? CURRENT_REVISION,
  );
  if (!ASSISTS.some((assist) => assist.id === config.assist))
    throw new Error("Choose a valid assist mode.");
  if (config.laps !== selected.laps)
    throw new Error(`This course requires ${selected.laps} laps.`);
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const milliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const remainder = ((milliseconds % 60_000) / 1000)
    .toFixed(3)
    .padStart(6, "0");
  return `${minutes}:${remainder}`;
}
export function medalFor(
  selected: CourseDefinition,
  seconds: number,
): "gold" | "silver" | "bronze" | "finish" {
  if (!Number.isFinite(seconds) || seconds < 0) return "finish";
  if (seconds <= selected.medals[0]) return "gold";
  if (seconds <= selected.medals[1]) return "silver";
  if (seconds <= selected.medals[2]) return "bronze";
  return "finish";
}
