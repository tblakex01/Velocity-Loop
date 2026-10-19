import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CARS, COURSES } from "../src/game/definitions";
import { getVehiclePose, roadClearance } from "../src/render/contact";
import { createCar, type CarModel } from "../src/render/car";
import { VEHICLE_ENVELOPE, WHEEL, WHEEL_RADIUS } from "../src/render/geometry";
import { disposeObject } from "../src/render/shared";

const models: CarModel[] = [];
beforeAll(() => {
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect() {},
        createRadialGradient: () => ({ addColorStop() {} }),
      }),
    }),
  });
  models.push(...CARS.map((car) => createCar(car)));
});
afterAll(() => {
  models.forEach((model) => disposeObject(model.root));
  vi.unstubAllGlobals();
});

function visibleBounds(model: CarModel) {
  model.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  model.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name === "contact-shadow")
      return;
    for (
      let ancestor: THREE.Object3D | null = object;
      ancestor;
      ancestor = ancestor.parent
    )
      if (!ancestor.visible) return;
    let box: THREE.Box3;
    if (object instanceof THREE.InstancedMesh) {
      object.computeBoundingBox();
      box = object.boundingBox!.clone();
    } else {
      object.geometry.computeBoundingBox();
      box = object.geometry.boundingBox!.clone();
    }
    bounds.union(box.applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

describe("canonical individually authored cars", () => {
  it("has four distinct silhouettes, cockpits, rim designs and exhaust layouts", () => {
    const signatures = models.map((model) =>
      Array.from(
        (
          model.root.getObjectByName(
            `${model.shape}-sculpted-wheel-arch-shell`,
          ) as THREE.Mesh
        ).geometry.getAttribute("position").array,
      )
        .map((value) => value.toFixed(4))
        .join(","),
    );
    expect(new Set(signatures).size).toBe(4);
    expect(
      models[0].root.getObjectByName("gt-curved-mid-cockpit"),
    ).toBeDefined();
    expect(
      models[0].root.getObjectByName("gt-midengine-glass-deck"),
    ).toBeDefined();
    expect(models[0].root.getObjectByName("gt-angular-red-led")).toBeDefined();
    expect(models[0].exhaustAnchors.map((p) => p.x)).toEqual([0]);
    expect(models[1].root.getObjectByName("comet-open-cockpit")).toBeDefined();
    expect(models[1].root.getObjectByName("comet-targa-hoop")).toBeDefined();
    expect(
      models[2].root.getObjectByName("apex-wraparound-jet-canopy"),
    ).toBeDefined();
    expect(models[2].root.getObjectByName("apex-high-aero-wing")).toBeDefined();
    expect(
      models[3].root.getObjectByName("titan-flat-retro-roof"),
    ).toBeDefined();
    expect(
      models[3].root.getObjectByName("titan-hood-power-bulge"),
    ).toBeDefined();
    expect(models.map((model) => model.lights.length)).toEqual([2, 2, 2, 4]);
    expect(
      models.map((model) =>
        (model.wheels[0].userData.spin as THREE.Group).children.find((child) =>
          child.name.endsWith("-spokes"),
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 20 }),
        expect.objectContaining({ count: 5 }),
        expect.objectContaining({ count: 12 }),
        expect.objectContaining({ count: 6 }),
      ]),
    );
  });
  it.each(CARS)("$name has real wheel openings and curved coachwork", (car) => {
    const model = models.find((model) => model.root.name === car.id)!;
    const shell = model.root.getObjectByName(
      `${model.shape}-sculpted-wheel-arch-shell`,
    ) as THREE.Mesh;
    shell.updateWorldMatrix(true, false);
    expect(shell.geometry.index!.count / 3).toBeGreaterThan(2000);
    for (const side of [-1, 1])
      for (const z of WHEEL.axleZ) {
        const direction = new THREE.Vector3(-side, 0, 0);
        const hole = new THREE.Raycaster(
          new THREE.Vector3(side * 0.7, WHEEL.centerY, z),
          direction,
          0,
          0.28,
        );
        expect(hole.intersectObject(shell, false)).toHaveLength(0);
        const fender = new THREE.Raycaster(
          new THREE.Vector3(
            side * 0.7,
            WHEEL.centerY + WHEEL_RADIUS + 0.057,
            z,
          ),
          direction,
          0,
          0.3,
        );
        expect(fender.intersectObject(shell, false).length).toBeGreaterThan(0);
      }
  });
  it.each(CARS)(
    "$name fits the camera/contact envelope with a bounded render graph",
    (car) => {
      const model = models.find((model) => model.root.name === car.id)!,
        bounds = visibleBounds(model);
      expect(bounds.min.x).toBeGreaterThanOrEqual(
        -VEHICLE_ENVELOPE.halfWidth - 0.001,
      );
      expect(bounds.max.x).toBeLessThanOrEqual(
        VEHICLE_ENVELOPE.halfWidth + 0.001,
      );
      expect(bounds.min.y).toBeGreaterThanOrEqual(
        VEHICLE_ENVELOPE.bottom - 0.001,
      );
      expect(bounds.max.y).toBeLessThanOrEqual(VEHICLE_ENVELOPE.top + 0.001);
      expect(bounds.min.z).toBeGreaterThanOrEqual(
        VEHICLE_ENVELOPE.rear - 0.001,
      );
      expect(bounds.max.z).toBeLessThanOrEqual(VEHICLE_ENVELOPE.front + 0.001);
      const materials = new Set<THREE.Material>();
      let meshes = 0;
      model.root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshes++;
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      expect(meshes).toBeLessThan(150);
      expect(materials.size).toBeLessThan(15);
    },
  );
  it.each(CARS)("$name ghost uses the same authored silhouette", (car) => {
    const ghost = createCar(car, true),
      normal = models.find((model) => model.root.name === car.id)!;
    const shell = (model: CarModel) =>
      model.root.getObjectByName(
        `${model.shape}-sculpted-wheel-arch-shell`,
      ) as THREE.Mesh;
    expect(shell(ghost).geometry.getAttribute("position").array).toEqual(
      shell(normal).geometry.getAttribute("position").array,
    );
    ghost.root.traverse((object) => {
      if (object instanceof THREE.Mesh)
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          expect(material.opacity).toBe(0.045);
          expect(material.depthWrite).toBe(false);
        }
    });
    const outline = ghost.root.getObjectByName(
      "ghost-canonical-hull-outline",
    ) as THREE.LineSegments;
    expect(outline.isLineSegments).toBe(true);
    expect(outline.geometry.getAttribute("position").count).toBeGreaterThan(16);
    expect((outline.material as THREE.LineBasicMaterial).opacity).toBe(0.55);
    expect(ghost.contact).toBeNull();
    disposeObject(ghost.root);
  });
  it("keeps the actual sculpted lower body vertices above every course through body roll", () => {
    for (const model of models) {
      model.body.rotation.z = 0.08;
      model.body.position.y = -0.009;
      model.root.updateMatrixWorld(true);
      const points: THREE.Vector3[] = [],
        seen = new Set<string>();
      model.body.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (
          let ancestor: THREE.Object3D | null = object;
          ancestor;
          ancestor = ancestor.parent
        )
          if (!ancestor.visible) return;
        const positions = object.geometry.getAttribute("position");
        const matrix = new THREE.Matrix4(),
          instances = object instanceof THREE.InstancedMesh ? object.count : 1;
        for (let instance = 0; instance < instances; instance++) {
          if (object instanceof THREE.InstancedMesh) {
            object.getMatrixAt(instance, matrix);
            matrix.premultiply(object.matrixWorld);
          } else matrix.copy(object.matrixWorld);
          for (let index = 0; index < positions.count; index++) {
            const point = new THREE.Vector3()
              .fromBufferAttribute(positions, index)
              .applyMatrix4(matrix);
            if (point.y > 0.21) continue;
            const key = point
              .toArray()
              .map((value) => value.toFixed(5))
              .join(",");
            if (!seen.has(key)) {
              seen.add(key);
              points.push(point);
            }
          }
        }
      });
      model.body.rotation.z = 0;
      model.body.position.y = 0;
      for (const course of COURSES) {
        let minimum = Infinity;
        for (let distance = 0; distance < course.length; distance += 4) {
          const pose = getVehiclePose(
            course.id,
            distance,
            0.7,
            model.shape,
            0,
            0.08,
            -0.009,
          );
          for (const point of points) {
            const world = point
              .clone()
              .applyQuaternion(pose.quaternion)
              .add(pose.position);
            minimum = Math.min(
              minimum,
              roadClearance(course.id, distance + point.z, world),
            );
          }
        }
        expect(
          minimum,
          `${model.shape} sculpted body on ${course.id}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
