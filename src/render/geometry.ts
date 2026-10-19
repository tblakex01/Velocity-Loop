import type { CarDefinition } from "../game/types";

export const TRACK_SURFACE_HEIGHT = 0.025;
export const TRACK_SHOULDER_WIDTH = 0.31;
export const TRACK_LIP_INNER_RATIO = 0.97;
export const TRACK_LIP_OUTER_RATIO = 1.025;
export const TRACK_LIP_HEIGHT = 0.22;
export const trackHalfWidth = (nominalWidth: number) =>
  nominalWidth / 2 + TRACK_SHOULDER_WIDTH;
export const BODY_FLOOR_HEIGHT = 0.17;
export const SPLITTER = {
  width: 0.74,
  height: 0.04,
  depth: 0.17,
  centerY: 0.16,
  noseOffset: 0.06,
};
export const WHEEL = {
  axleX: [-0.48, 0.48],
  axleZ: [-0.7, 0.69],
  centerY: 0.225,
  tireMajorRadius: 0.166,
  tireMinorRadius: 0.064,
  rimOffset: 0.081,
  rimTubeRadius: 0.013,
  treadCenterRadius: 0.228,
  treadSize: [0.102, 0.007, 0.022],
};
// The rotating rectangular tread extends farther than the rubber torus.
export const WHEEL_RADIUS = Math.max(
  WHEEL.tireMajorRadius + WHEEL.tireMinorRadius,
  Math.hypot(
    WHEEL.treadCenterRadius + WHEEL.treadSize[1] / 2,
    WHEEL.treadSize[2] / 2,
  ),
);
export const CHASSIS = {
  width: 0.79,
  height: 0.095,
  length: 2.05,
  centerY: 0.15,
};
export const CABIN = {
  baseHeight: 0.47,
  roofThickness: 0.045,
  height: { gt: 0.17, compact: 0.23, wedge: 0.17, muscle: 0.21 },
};
export const EXHAUST = {
  radius: 0.04,
  length: 0.14,
  tailOffset: 0.03,
  centerY: 0.23,
  rearCap: 0.005,
};
export const DIFFUSER = {
  bodies: ["gt", "wedge"] as CarDefinition["body"][],
  trayWidth: 0.89,
  trayHeight: 0.063,
  trayDepth: 0.21,
  trayY: 0.164,
  trayTailOffset: 0.015,
  finWidth: 0.019,
  finHeight: 0.103,
  finDepth: 0.19,
  finY: 0.195,
  finTailOffset: 0.016,
  finPitch: -0.13,
  finX: [-0.34, -0.22, 0.22, 0.34],
};
export const BODY_SECTIONS: Record<CarDefinition["body"], number[][]> = {
  compact: [
    [-1.02, 0.34, 0.34],
    [-0.77, 0.47, 0.4],
    [-0.38, 0.46, 0.37],
    [0.2, 0.43, 0.35],
    [0.69, 0.48, 0.37],
    [0.89, 0.42, 0.32],
    [1.01, 0.34, 0.28],
  ],
  wedge: [
    [-1.23, 0.43, 0.36],
    [-0.96, 0.5, 0.39],
    [-0.7, 0.5, 0.38],
    [-0.17, 0.45, 0.345],
    [0.35, 0.445, 0.3],
    [0.7, 0.495, 0.3],
    [1.03, 0.42, 0.24],
    [1.22, 0.34, 0.225],
  ],
  muscle: [
    [-1.19, 0.43, 0.42],
    [-0.88, 0.49, 0.445],
    [-0.6, 0.485, 0.445],
    [0.12, 0.47, 0.43],
    [0.68, 0.49, 0.445],
    [0.98, 0.46, 0.42],
    [1.15, 0.42, 0.4],
  ],
  gt: [
    [-1.2, 0.42, 0.4],
    [-0.95, 0.495, 0.45],
    [-0.7, 0.5, 0.45],
    [-0.25, 0.445, 0.43],
    [0.18, 0.435, 0.39],
    [0.69, 0.5, 0.345],
    [0.98, 0.445, 0.29],
    [1.2, 0.34, 0.255],
  ],
};
export const VEHICLE_ENVELOPE = {
  halfWidth:
    Math.max(...WHEEL.axleX.map(Math.abs)) +
    Math.max(WHEEL.tireMinorRadius, WHEEL.rimOffset + WHEEL.rimTubeRadius),
  bottom: WHEEL.centerY - WHEEL_RADIUS,
  top:
    CABIN.baseHeight +
    Math.max(...Object.values(CABIN.height)) +
    CABIN.roofThickness / 2 +
    0.0045,
  rear:
    Math.min(
      ...Object.values(BODY_SECTIONS).flatMap((sections) =>
        sections.map((section) => section[0]),
      ),
    ) -
    Math.max(
      EXHAUST.tailOffset + EXHAUST.length / 2 + EXHAUST.rearCap,
      DIFFUSER.finTailOffset +
        (Math.abs(Math.cos(DIFFUSER.finPitch)) * DIFFUSER.finDepth) / 2 +
        (Math.abs(Math.sin(DIFFUSER.finPitch)) * DIFFUSER.finHeight) / 2,
    ),
  front:
    Math.max(
      ...Object.values(BODY_SECTIONS).flatMap((sections) =>
        sections.map((section) => section[0]),
      ),
    ) +
    SPLITTER.noseOffset +
    SPLITTER.depth / 2,
};
