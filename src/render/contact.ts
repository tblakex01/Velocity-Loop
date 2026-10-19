import * as THREE from "three";
import type { CarDefinition, CourseId } from "../game/types";
import { sampleTrack } from "../game/track";
import {
  BODY_SECTIONS,
  BODY_FLOOR_HEIGHT,
  CHASSIS,
  TRACK_SURFACE_HEIGHT,
  WHEEL,
  WHEEL_RADIUS,
  SPLITTER,
  DIFFUSER,
} from "./geometry";
import { vec } from "./shared";

const CONTACT_SKIN = 0.001;
const tireFootprint: THREE.Vector3[] = [];
for (const x of WHEEL.axleX)
  for (const z of WHEEL.axleZ)
    for (const side of [-1, 1])
      for (let i = 0; i <= 32; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 32;
        tireFootprint.push(
          new THREE.Vector3(
            x + side * WHEEL.tireMinorRadius,
            WHEEL.centerY - Math.cos(angle) * WHEEL_RADIUS,
            z + Math.sin(angle) * WHEEL_RADIUS,
          ),
        );
      }
const chassisFootprints = Object.fromEntries(
  Object.entries(BODY_SECTIONS).map(([body, sections]) => {
    const points = sections.flatMap(([z, width]) =>
      [-1, 1].map(
        (side) => new THREE.Vector3(side * width * 0.75, BODY_FLOOR_HEIGHT, z),
      ),
    );
    for (const x of [-CHASSIS.width / 2, CHASSIS.width / 2])
      for (const z of [-CHASSIS.length / 2, CHASSIS.length / 2])
        points.push(
          new THREE.Vector3(x, CHASSIS.centerY - CHASSIS.height / 2, z),
        );
    for (const x of [-SPLITTER.width / 2, SPLITTER.width / 2])
      points.push(
        new THREE.Vector3(
          x,
          SPLITTER.centerY - SPLITTER.height / 2,
          sections[sections.length - 1][0] +
            SPLITTER.noseOffset +
            SPLITTER.depth / 2,
        ),
      );
    if (DIFFUSER.bodies.includes(body as CarDefinition["body"])) {
      const tail = sections[0][0],
        cos = Math.cos(DIFFUSER.finPitch),
        sin = Math.sin(DIFFUSER.finPitch);
      for (const x of DIFFUSER.finX)
        for (const side of [-1, 1])
          for (const y of [-DIFFUSER.finHeight / 2, DIFFUSER.finHeight / 2])
            for (const z of [-DIFFUSER.finDepth / 2, DIFFUSER.finDepth / 2]) {
              points.push(
                new THREE.Vector3(
                  x + (side * DIFFUSER.finWidth) / 2,
                  DIFFUSER.finY + y * cos - z * sin,
                  tail - DIFFUSER.finTailOffset + y * sin + z * cos,
                ),
              );
            }
    }
    return [body, points];
  }),
) as Record<CarDefinition["body"], THREE.Vector3[]>;

export function getVehiclePose(
  courseId: CourseId,
  distance: number,
  lateral: number,
  body: CarDefinition["body"],
  airHeight = 0,
  roll = 0,
  bounce = 0,
) {
  if (
    ![distance, lateral, airHeight, roll, bounce].every(Number.isFinite) ||
    airHeight < 0
  )
    throw new Error(
      "Vehicle placement requires finite coordinates and nonnegative flight height.",
    );
  const sample = sampleTrack(courseId, distance);
  const up = vec(sample.up),
    right = vec(sample.right),
    tangent = vec(sample.tangent);
  const base = vec(sample.center).addScaledVector(right, lateral);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, tangent),
  );
  const local = new THREE.Vector3(),
    world = new THREE.Vector3();
  let lift = -Infinity;
  function support(point: THREE.Vector3, chassis: boolean) {
    local.copy(point);
    if (chassis) {
      const x = local.x,
        y = local.y;
      local.x = x * Math.cos(roll) - y * Math.sin(roll);
      local.y = x * Math.sin(roll) + y * Math.cos(roll) + bounce;
    }
    world.copy(local).applyQuaternion(quaternion).add(base);
    const road = sampleTrack(courseId, distance + local.z),
      normal = vec(road.up);
    const alignment = up.dot(normal);
    if (alignment <= 0.5)
      throw new Error("Road curvature exceeds the vehicle support footprint.");
    const required =
      (TRACK_SURFACE_HEIGHT +
        CONTACT_SKIN -
        world.clone().sub(vec(road.center)).dot(normal)) /
      alignment;
    lift = Math.max(lift, required);
  }
  tireFootprint.forEach((point) => support(point, false));
  chassisFootprints[body].forEach((point) => support(point, true));
  return {
    position: base.addScaledVector(up, lift + airHeight),
    quaternion,
    lift,
  };
}
export const CHASE_HEIGHT = 1.08;
export const chaseDistance = (speed: number) =>
  2.4 + Math.max(0, speed) * 0.004;
export function getChasePosition(
  courseId: CourseId,
  distance: number,
  speed: number,
  lateral = 0,
) {
  const sample = sampleTrack(courseId, distance - chaseDistance(speed));
  return vec(sample.center)
    .addScaledVector(vec(sample.up), CHASE_HEIGHT)
    .addScaledVector(vec(sample.right), lateral);
}
export function roadClearance(
  courseId: CourseId,
  distance: number,
  position: THREE.Vector3,
) {
  const sample = sampleTrack(courseId, distance);
  return (
    position.clone().sub(vec(sample.center)).dot(vec(sample.up)) -
    TRACK_SURFACE_HEIGHT
  );
}
