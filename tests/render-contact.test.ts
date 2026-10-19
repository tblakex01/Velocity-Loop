import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CARS, COURSES } from "../src/game/definitions";
import { sampleTrack, getTrackPoints } from "../src/game/track";
import {
  getVehiclePose,
  getChasePosition,
  chaseDistance,
  roadClearance,
} from "../src/render/contact";
import {
  BODY_SECTIONS,
  BODY_FLOOR_HEIGHT,
  CHASSIS,
  WHEEL,
  WHEEL_RADIUS,
  SPLITTER,
  VEHICLE_ENVELOPE,
  TRACK_LIP_INNER_RATIO,
  TRACK_LIP_OUTER_RATIO,
  TRACK_LIP_HEIGHT,
  trackHalfWidth,
} from "../src/render/geometry";
import { CameraRig } from "../src/render/camera";
import { createTrackGeometry } from "../src/render/trackGeometry";
import { createCar } from "../src/render/car";
import { disposeObject } from "../src/render/shared";

function closestRoadDistance(
  courseId: (typeof COURSES)[number]["id"],
  point: THREE.Vector3,
  near: number,
) {
  let distance = near;
  for (let i = 0; i < 8; i++) {
    const road = sampleTrack(courseId, distance);
    distance += point
      .clone()
      .sub(new THREE.Vector3(...road.center))
      .dot(new THREE.Vector3(...road.tangent));
  }
  return distance;
}

describe("physical render contact", () => {
  it.each(COURSES)(
    "$name keeps every model above its sampled road surface",
    (course) => {
      let minimumWheel = Infinity,
        minimumChassis = Infinity;
      for (const car of CARS)
        for (let distance = 0; distance < course.length; distance += 1) {
          const pose = getVehiclePose(
            course.id,
            distance,
            0.7,
            car.body,
            0,
            0.08,
            -0.009,
          );
          for (const x of WHEEL.axleX)
            for (const z of WHEEL.axleZ)
              for (const side of [-1, 1])
                for (
                  let a = -Math.PI / 2;
                  a <= Math.PI / 2;
                  a += Math.PI / 48
                ) {
                  const local = new THREE.Vector3(
                    x + side * WHEEL.tireMinorRadius,
                    WHEEL.centerY - Math.cos(a) * WHEEL_RADIUS,
                    z + Math.sin(a) * WHEEL_RADIUS,
                  );
                  const world = local
                    .clone()
                    .applyQuaternion(pose.quaternion)
                    .add(pose.position);
                  minimumWheel = Math.min(
                    minimumWheel,
                    roadClearance(course.id, distance + local.z, world),
                  );
                }
          const corners = BODY_SECTIONS[car.body].flatMap(([z, width]) =>
            [-1, 1].map(
              (side) =>
                new THREE.Vector3(side * width * 0.75, BODY_FLOOR_HEIGHT, z),
            ),
          );
          for (const x of [-CHASSIS.width / 2, CHASSIS.width / 2])
            for (const z of [-CHASSIS.length / 2, CHASSIS.length / 2])
              corners.push(
                new THREE.Vector3(x, CHASSIS.centerY - CHASSIS.height / 2, z),
              );
          const nose = BODY_SECTIONS[car.body].at(-1)![0];
          for (const side of [-1, 1])
            corners.push(
              new THREE.Vector3(
                (side * SPLITTER.width) / 2,
                SPLITTER.centerY - SPLITTER.height / 2,
                nose + SPLITTER.noseOffset + SPLITTER.depth / 2,
              ),
            );
          for (const local of corners) {
            local.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.08);
            local.y -= 0.009;
            const world = local
              .clone()
              .applyQuaternion(pose.quaternion)
              .add(pose.position);
            minimumChassis = Math.min(
              minimumChassis,
              roadClearance(course.id, distance + local.z, world),
            );
          }
        }
      expect(
        minimumWheel,
        `worst wheel clearance on ${course.id}`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        minimumChassis,
        `worst chassis clearance on ${course.id}`,
      ).toBeGreaterThanOrEqual(0);
    },
  );
  it.each(COURSES)(
    "$name keeps boosted chase camera on the drivable side of the road",
    (course) => {
      let minimum = Infinity;
      for (let distance = 0; distance < course.length; distance += 0.5) {
        const position = getChasePosition(course.id, distance, 40);
        minimum = Math.min(
          minimum,
          roadClearance(course.id, distance - chaseDistance(40), position),
        );
      }
      expect(minimum).toBeGreaterThan(1);
    },
  );
  it("keeps an airborne car above its grounded support pose", () => {
    const grounded = getVehiclePose("ignition", 60, 0.5, "gt"),
      air = getVehiclePose("ignition", 60, 0.5, "gt", 1.2);
    const up = new THREE.Vector3(...sampleTrack("ignition", 60).up);
    expect(air.position.clone().sub(grounded.position).dot(up)).toBeCloseTo(
      1.2,
      8,
    );
  });
  it.each(COURSES)(
    "$name keeps the damped camera and its sightline clear through a boosted lap",
    (course) => {
      const rig = new CameraRig(),
        camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.05, 650),
        surface = new THREE.Mesh(
          createTrackGeometry(getTrackPoints(course.id)),
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        ),
        speed = 40,
        dt = 1 / 120;
      let minimumCamera = Infinity,
        minimumRay = Infinity;
      for (let distance = 0; distance < course.length; distance += speed * dt) {
        const sample = sampleTrack(course.id, distance),
          ahead = sampleTrack(course.id, distance + speed * 0.26);
        const vehicle = getVehiclePose(course.id, distance, 0.7, "gt");
        rig.update(
          camera,
          vehicle.position,
          sample,
          ahead,
          getChasePosition(course.id, distance, speed, 0.7),
          surface,
          "chase",
          false,
          distance / speed,
          speed,
          dt,
        );
        const behind = closestRoadDistance(
          course.id,
          camera.position,
          distance - chaseDistance(speed) - speed / 9,
        );
        minimumCamera = Math.min(
          minimumCamera,
          roadClearance(course.id, behind, camera.position),
        );
        const subject = vehicle.position
          .clone()
          .addScaledVector(new THREE.Vector3(...sample.up), 0.4);
        for (let i = 0; i <= 16; i++) {
          const fraction = i / 16,
            point = camera.position.clone().lerp(subject, fraction),
            near = behind + (distance - behind) * fraction;
          minimumRay = Math.min(
            minimumRay,
            roadClearance(
              course.id,
              closestRoadDistance(course.id, point, near),
              point,
            ),
          );
        }
      }
      expect(minimumCamera, `camera clearance on ${course.id}`).toBeGreaterThan(
        0.1,
      );
      expect(
        minimumRay,
        `camera sightline clearance on ${course.id}`,
      ).toBeGreaterThan(0);
      surface.geometry.dispose();
      surface.material.dispose();
    },
  );
  it.each(COURSES)(
    "$name keeps all three cameras visible against the actual rendered triangles",
    (course) => {
      const surface = new THREE.Mesh(
        createTrackGeometry(getTrackPoints(course.id)),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      const ray = new THREE.Raycaster();
      for (const mode of ["chase", "orbit", "hood"] as const) {
        const rig = new CameraRig(),
          camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.05, 650),
          speed = 40,
          dt = 1 / 60;
        for (
          let distance = 0;
          distance < course.length;
          distance += speed * dt
        ) {
          const sample = sampleTrack(course.id, distance),
            position = getVehiclePose(course.id, distance, 0.7, "gt").position;
          rig.update(
            camera,
            position,
            sample,
            sampleTrack(course.id, distance + 10.4),
            getChasePosition(course.id, distance, speed, 0.7),
            surface,
            mode,
            false,
            distance / speed,
            speed,
            dt,
          );
          const subject = position
              .clone()
              .addScaledVector(new THREE.Vector3(...sample.up), 0.4),
            direction = camera.position.clone().sub(subject),
            span = direction.length();
          ray.set(subject, direction.normalize());
          ray.near = 0.01;
          ray.far = span;
          expect(
            ray.intersectObject(surface, false),
            `${mode} occlusion at ${course.id} distance${distance.toFixed(2)}`,
          ).toHaveLength(0);
        }
      }
      surface.geometry.dispose();
      surface.material.dispose();
    },
  );
  it.each(COURSES)(
    "$name keeps the complete chase car envelope within the viewport through boost",
    (course) => {
      const surface = new THREE.Mesh(
        createTrackGeometry(getTrackPoints(course.id)),
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      const rig = new CameraRig(),
        camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.05, 650),
        speed = 40,
        dt = 1 / 60;
      let minimumY = Infinity,
        maximumY = -Infinity,
        maximumX = 0;
      for (let distance = 0; distance < course.length; distance += speed * dt) {
        const sample = sampleTrack(course.id, distance),
          pose = getVehiclePose(course.id, distance, 0.7, "gt");
        rig.update(
          camera,
          pose.position,
          sample,
          sampleTrack(course.id, distance + 10.4),
          getChasePosition(course.id, distance, speed, 0.7),
          surface,
          "chase",
          false,
          distance / speed,
          speed,
          dt,
        );
        camera.updateMatrixWorld();
        for (const x of [
          -VEHICLE_ENVELOPE.halfWidth,
          VEHICLE_ENVELOPE.halfWidth,
        ])
          for (const y of [VEHICLE_ENVELOPE.bottom, VEHICLE_ENVELOPE.top])
            for (const z of [VEHICLE_ENVELOPE.rear, VEHICLE_ENVELOPE.front]) {
              const projected = new THREE.Vector3(x, y, z)
                .applyQuaternion(pose.quaternion)
                .add(pose.position)
                .project(camera);
              minimumY = Math.min(minimumY, projected.y);
              maximumY = Math.max(maximumY, projected.y);
              maximumX = Math.max(maximumX, Math.abs(projected.x));
            }
      }
      expect(minimumY, `bottom crop on ${course.id}`).toBeGreaterThan(-0.98);
      expect(maximumY, `top crop on ${course.id}`).toBeLessThan(0.98);
      expect(maximumX, `side crop on ${course.id}`).toBeLessThan(0.98);
      surface.geometry.dispose();
      surface.material.dispose();
    },
  );
  it.each([
    { width: 931, height: 722 },
    { width: 390, height: 844 },
  ])(
    "keeps every course chase envelope framed at $width×$height",
    (viewport) => {
      for (const course of COURSES) {
        const surface = new THREE.Mesh(
          createTrackGeometry(getTrackPoints(course.id)),
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        const rig = new CameraRig(),
          camera = new THREE.PerspectiveCamera(
            52,
            viewport.width / viewport.height,
            0.05,
            650,
          ),
          speed = 40,
          dt = 1 / 60;
        let minY = Infinity,
          maxY = -Infinity,
          maxX = 0,
          nearestDepth = -Infinity;
        for (
          let distance = 0;
          distance < course.length;
          distance += speed * dt
        ) {
          const sample = sampleTrack(course.id, distance),
            pose = getVehiclePose(course.id, distance, 0.7, "gt");
          rig.update(
            camera,
            pose.position,
            sample,
            sampleTrack(course.id, distance + 10.4),
            getChasePosition(course.id, distance, speed, 0.7),
            surface,
            "chase",
            false,
            distance / speed,
            speed,
            dt,
          );
          camera.updateMatrixWorld();
          for (const x of [
            -VEHICLE_ENVELOPE.halfWidth,
            VEHICLE_ENVELOPE.halfWidth,
          ])
            for (const y of [VEHICLE_ENVELOPE.bottom, VEHICLE_ENVELOPE.top])
              for (const z of [VEHICLE_ENVELOPE.rear, VEHICLE_ENVELOPE.front]) {
                const world = new THREE.Vector3(x, y, z)
                  .applyQuaternion(pose.quaternion)
                  .add(pose.position);
                nearestDepth = Math.max(
                  nearestDepth,
                  world.clone().applyMatrix4(camera.matrixWorldInverse).z,
                );
                const point = world.project(camera);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
                maxX = Math.max(maxX, Math.abs(point.x));
              }
        }
        expect(minY, `${course.id} bottom`).toBeGreaterThan(-0.98);
        expect(maxY, `${course.id} top`).toBeLessThan(0.98);
        expect(maxX, `${course.id} side`).toBeLessThan(0.98);
        expect(nearestDepth, `${course.id} camera depth`).toBeLessThan(
          -camera.near,
        );
        surface.geometry.dispose();
        surface.material.dispose();
      }
    },
  );
  it.each(COURSES)(
    "$name keeps actual turned wheels outside the solid lips near both valid steering edges",
    (course) => {
      for (const car of CARS) {
        const model = createCar(car, true);
        for (const distance of [10, 108, 144])
          for (const side of [-1, 1])
            for (const yaw of [-0.3, 0.3]) {
              const sample = sampleTrack(course.id, distance),
                edge = side * (course.width / 2 - 0.401),
                pose = getVehiclePose(course.id, distance, edge, car.body);
              model.root.position.copy(pose.position);
              model.root.quaternion.copy(pose.quaternion);
              model.frontWheels.forEach((wheel) => (wheel.rotation.y = yaw));
              model.root.updateMatrixWorld(true);
              let intersections = 0;
              for (const wheel of model.wheels)
                wheel.traverse((object) => {
                  if (!(object instanceof THREE.Mesh)) return;
                  const attribute = object.geometry.getAttribute("position"),
                    matrix = new THREE.Matrix4(),
                    count =
                      object instanceof THREE.InstancedMesh ? object.count : 1;
                  for (let instance = 0; instance < count; instance++) {
                    if (object instanceof THREE.InstancedMesh) {
                      object.getMatrixAt(instance, matrix);
                      matrix.premultiply(object.matrixWorld);
                    } else matrix.copy(object.matrixWorld);
                    for (let i = 0; i < attribute.count; i++) {
                      const point = new THREE.Vector3()
                        .fromBufferAttribute(attribute, i)
                        .applyMatrix4(matrix)
                        .sub(new THREE.Vector3(...sample.center));
                      const x = Math.abs(
                          point.dot(new THREE.Vector3(...sample.right)),
                        ),
                        y = point.dot(new THREE.Vector3(...sample.up));
                      if (
                        x >=
                          trackHalfWidth(course.width) *
                            TRACK_LIP_INNER_RATIO &&
                        x <=
                          trackHalfWidth(course.width) *
                            TRACK_LIP_OUTER_RATIO &&
                        y >= -0.14 &&
                        y <= TRACK_LIP_HEIGHT
                      )
                        intersections++;
                    }
                  }
                });
              expect(
                intersections,
                `${car.id} side${side} yaw${yaw} lip overlap`,
              ).toBe(0);
            }
        disposeObject(model.root);
      }
    },
  );
});
