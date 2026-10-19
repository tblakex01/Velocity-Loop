import {
  CURRENT_REVISION,
  type CourseId,
  type TrackRevision,
  type TrackSample,
  type Vec3,
} from "./types";

type Layout = {
  straight: number;
  radius: number;
  loopRadius: number;
  loops: number;
  jumps: number;
  width: number;
  bank: number;
};
export const TRACK_LAYOUTS: Record<CourseId, Layout> = {
  ignition: {
    straight: 94,
    radius: 20,
    loopRadius: 7,
    loops: 1,
    jumps: 1,
    width: 4.8,
    bank: 0.34,
  },
  copper: {
    straight: 76,
    radius: 19,
    loopRadius: 7.5,
    loops: 1,
    jumps: 1,
    width: 4.5,
    bank: 0.48,
  },
  double: {
    straight: 100,
    radius: 22,
    loopRadius: 8,
    loops: 2,
    jumps: 1,
    width: 4.3,
    bank: 0.52,
  },
  neon: {
    straight: 140,
    radius: 26,
    loopRadius: 8.5,
    loops: 2,
    jumps: 2,
    width: 4.2,
    bank: 0.57,
  },
  skyline: {
    straight: 164,
    radius: 28,
    loopRadius: 9,
    loops: 3,
    jumps: 2,
    width: 4.2,
    bank: 0.62,
  },
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const sub = (a: Vec3, b: Vec3): Vec3 => add(a, mul(b, -1));
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const magnitude = (a: Vec3) => Math.hypot(...a);
const normalize = (a: Vec3): Vec3 => mul(a, 1 / (magnitude(a) || 1));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 =>
  add(mul(a, 1 - t), mul(b, t));

function frame(
  center: Vec3,
  tangent: Vec3,
  normal: Vec3,
  bank: number,
  width: number,
  jump = false,
): TrackSample {
  const forward = normalize(tangent);
  const upright = normalize(sub(normal, mul(forward, dot(forward, normal))));
  const side = normalize(cross(upright, forward));
  const up = add(mul(upright, Math.cos(bank)), mul(side, Math.sin(bank)));
  return {
    center,
    tangent: forward,
    up,
    right: normalize(cross(up, forward)),
    curvature: 0,
    bank,
    width,
    jump,
  };
}

const smoothstep = (value: number) => value * value * (3 - 2 * value);

function buildTrack(layout: Layout, revision: TrackRevision) {
  const points: TrackSample[] = [];
  const { straight: straightLength, radius, loopRadius, loops, width } = layout;
  const half = straightLength / 2;
  function segment(estimatedLength: number, at: (t: number) => TrackSample) {
    const count = Math.ceil(estimatedLength / 0.45);
    for (let i = points.length ? 1 : 0; i <= count; i++)
      points.push(at(i / count));
  }
  const laneAdvance = revision === 2 ? width + 2 : 0;
  function bottom(from: number, to: number, exitLane = 0) {
    const span = to - from;
    // Stay beyond the entire loop before blending its exit lane back to the straight.
    const hold = exitLane ? loopRadius + width : 0;
    const blendLength = span - hold;
    if (exitLane && blendLength <= 0)
      throw new Error("Loop exit requires a clear connecting straight.");
    segment(span + exitLane * 2, (t) => {
      const blend = exitLane ? Math.max(0, (span * t - hold) / blendLength) : 0;
      const z = -radius + exitLane * (1 - smoothstep(blend));
      const slope =
        exitLane && blend > 0
          ? (-exitLane * 6 * blend * (1 - blend)) / blendLength
          : 0;
      return frame([from + span * t, 0, z], [1, 0, slope], [0, 1, 0], 0, width);
    });
  }
  let position = -half;
  const advance = 6;
  for (let i = 0; i < loops; i++) {
    const entry =
      -half + (straightLength * (i + 1)) / (loops + 1) - advance / 2;
    bottom(position, entry, i > 0 ? laneAdvance : 0);
    segment(2 * Math.PI * loopRadius + advance + laneAdvance, (t) => {
      const angle = t * Math.PI * 2;
      const tangent: Vec3 = [
        loopRadius * Math.cos(angle) + advance / (2 * Math.PI),
        loopRadius * Math.sin(angle),
        (laneAdvance * 6 * t * (1 - t)) / (2 * Math.PI),
      ];
      const normal: Vec3 = [-tangent[1], tangent[0], 0];
      return frame(
        [
          entry + loopRadius * Math.sin(angle) + advance * t,
          loopRadius * (1 - Math.cos(angle)),
          -radius + laneAdvance * smoothstep(t),
        ],
        tangent,
        normal,
        0,
        width,
      );
    });
    position = entry + advance;
  }
  bottom(position, half, laneAdvance);
  function bend(centerX: number, startAngle: number) {
    segment(Math.PI * radius, (t) => {
      const angle = startAngle + t * Math.PI;
      const bank = -layout.bank * Math.sin(Math.PI * t) ** 2;
      return frame(
        [centerX + radius * Math.cos(angle), 0, radius * Math.sin(angle)],
        [-Math.sin(angle), 0, Math.cos(angle)],
        [0, 1, 0],
        bank,
        width,
      );
    });
  }
  bend(half, -Math.PI / 2);
  segment(straightLength * 1.1, (t) => {
    const traveled = t * straightLength;
    let y = 0,
      slope = 0,
      jump = false;
    for (let i = 0; i < layout.jumps; i++) {
      const center = (straightLength * (i + 1)) / (layout.jumps + 1);
      const rampLength = 22;
      const fraction = (traveled - center + rampLength / 2) / rampLength;
      if (fraction > 0 && fraction < 1) {
        y = 2.8 * Math.sin(Math.PI * fraction) ** 2;
        slope =
          ((2.8 * Math.PI) / rampLength) * Math.sin(2 * Math.PI * fraction);
        jump = fraction > 0.34 && fraction < 0.39;
      }
    }
    return frame(
      [half - traveled, y, radius],
      [-1, slope, 0],
      [0, 1, 0],
      0,
      width,
      jump,
    );
  });
  bend(-half, Math.PI / 2);
  // Include a precise seam: distance=length must reproduce the starting frame.
  points[points.length - 1] = { ...points[0] };
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(
      distances[i - 1] + magnitude(sub(points[i].center, points[i - 1].center)),
    );
  for (let i = 0; i < points.length - 1; i++) {
    const previous = points[i === 0 ? points.length - 2 : i - 1];
    const next = points[i + 1];
    const span =
      magnitude(sub(points[i].center, previous.center)) +
      magnitude(sub(next.center, points[i].center));
    const turn = sub(next.tangent, previous.tangent);
    const signedTurn = dot(turn, points[i].right);
    // A helical loop changes lateral turn direction without reversing its
    // supporting normal curvature. Keep loop magnitudes positive through interpolation.
    const verticalLoop = revision === 2 && points[i].center[1] > 0.000001;
    points[i].curvature =
      (magnitude(turn) / Math.max(span, 0.001)) *
      (!verticalLoop && signedTurn < -0.001 ? -1 : 1);
  }
  points[points.length - 1].curvature = points[0].curvature;
  return { points, distances, length: distances[distances.length - 1] };
}

const tracks = Object.fromEntries(
  ([1, 2] as const).map((revision) => [
    revision,
    Object.fromEntries(
      Object.entries(TRACK_LAYOUTS).map(([id, layout]) => [
        id,
        buildTrack(layout, revision),
      ]),
    ),
  ]),
) as Record<TrackRevision, Record<CourseId, ReturnType<typeof buildTrack>>>;
function getTrack(id: CourseId, revision: TrackRevision) {
  if (revision !== 1 && revision !== 2)
    throw new Error("Choose a supported track revision.");
  if (!Object.hasOwn(tracks[revision], id))
    throw new Error("Choose a valid course.");
  const track = tracks[revision][id];
  if (!track) throw new Error("Choose a valid course.");
  return track;
}
export function trackLength(
  id: CourseId,
  revision: TrackRevision = CURRENT_REVISION,
) {
  return getTrack(id, revision).length;
}
export function getTrackPoints(
  id: CourseId,
  revision: TrackRevision = CURRENT_REVISION,
): TrackSample[] {
  return getTrack(id, revision).points;
}

export function sampleTrack(
  id: CourseId,
  distance: number,
  revision: TrackRevision = CURRENT_REVISION,
): TrackSample {
  if (!Number.isFinite(distance))
    throw new Error("Track distance must be finite.");
  const track = getTrack(id, revision);
  const wrapped = ((distance % track.length) + track.length) % track.length;
  let low = 0,
    high = track.distances.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (track.distances[middle] <= wrapped) low = middle;
    else high = middle;
  }
  const alpha =
    (wrapped - track.distances[low]) /
    (track.distances[high] - track.distances[low]);
  const a = track.points[low],
    b = track.points[high];
  const tangent = normalize(mix(a.tangent, b.tangent, alpha));
  const up = normalize(
    sub(
      mix(a.up, b.up, alpha),
      mul(tangent, dot(mix(a.up, b.up, alpha), tangent)),
    ),
  );
  return {
    center: mix(a.center, b.center, alpha),
    tangent,
    up,
    right: normalize(cross(up, tangent)),
    curvature: a.curvature + (b.curvature - a.curvature) * alpha,
    bank: a.bank + (b.bank - a.bank) * alpha,
    width: a.width,
    jump: a.jump || b.jump,
  };
}
