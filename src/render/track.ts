import * as THREE from "three";
import type { CourseId, TrackSample } from "../game/types";
import { getTrackPoints, sampleTrack } from "../game/track";
import { box, cylinder, labelTexture, vec } from "./shared";
import { createTrackGeometry } from "./trackGeometry";
import { buildTrackLights } from "./trackLights";

export function trackOrientation(sample: TrackSample) {
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      vec(sample.right),
      vec(sample.up),
      vec(sample.tangent),
    ),
  );
}
export function buildTrack(courseId: CourseId) {
  const root = new THREE.Group(),
    points = getTrackPoints(courseId);
  const geometry = createTrackGeometry(points);
  const road = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: "#f35c0a",
      metalness: 0.08,
      roughness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.24,
      envMapIntensity: 0.12,
      side: THREE.DoubleSide,
    }),
  );
  road.receiveShadow = true;
  road.castShadow = true;
  root.add(road);
  root.add(buildTrackLights(points));
  const clipMaterial = new THREE.MeshStandardMaterial({
    color: "#af431b",
    roughness: 0.47,
  });
  const supportMaterial = new THREE.MeshStandardMaterial({
    color: "#eace8b",
    metalness: 0.13,
    roughness: 0.56,
  });
  const stripeMaterial = new THREE.MeshStandardMaterial({
    color: "#fbc291",
    roughness: 0.5,
  });
  const markerIndices = points.map((_, i) => i).filter((i) => i % 10 === 0);
  const markings = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.012, 0.32),
    stripeMaterial,
    markerIndices.length * 2,
  );
  const dummy = new THREE.Object3D();
  let n = 0;
  for (const i of markerIndices) {
    const p = points[i];
    for (const side of [-1, 1]) {
      dummy.position
        .copy(vec(p.center))
        .addScaledVector(vec(p.right), side * p.width * 0.4)
        .addScaledVector(vec(p.up), 0.041);
      dummy.quaternion.copy(trackOrientation(p));
      dummy.updateMatrix();
      markings.setMatrixAt(n++, dummy.matrix);
    }
  }
  root.add(markings);
  const elevated = points.filter(
    (p, i) => i % 55 === 0 && p.center[1] > 1.4 && p.up[1] > 0.25,
  );
  const supports = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.13, 0.22, 1, 8),
    supportMaterial,
    elevated.length * 2,
  );
  n = 0;
  for (const p of elevated) {
    for (const side of [-1, 1]) {
      const c = vec(p.center).addScaledVector(
        vec(p.right),
        side * p.width * 0.4,
      );
      dummy.position.set(c.x, (c.y - 0.48) / 2, c.z);
      dummy.quaternion.identity();
      dummy.scale.set(1, Math.max(0.2, c.y + 0.48), 1);
      dummy.updateMatrix();
      supports.setMatrixAt(n++, dummy.matrix);
    }
    const join = box(root, [p.width, 0.18, 0.22], [...p.center], clipMaterial);
    join.quaternion.copy(trackOrientation(p));
    join.position.addScaledVector(vec(p.up), -0.17);
  }
  supports.castShadow = true;
  root.add(supports);
  const start = sampleTrack(courseId, 0),
    gate = new THREE.Group();
  gate.position.copy(vec(start.center));
  gate.quaternion.copy(trackOrientation(start));
  root.add(gate);
  const sage = new THREE.MeshStandardMaterial({
    color: "#203f36",
    roughness: 0.55,
  });
  for (const x of [-start.width * 0.68, start.width * 0.68]) {
    cylinder(gate, 0.075, 3.35, [x, 1.65, 0], sage);
    box(gate, [0.68, 0.15, 0.7], [x, -0.05, 0], sage, 0.03);
  }
  box(gate, [start.width * 1.47, 0.58, 0.1], [0, 3.04, 0], sage, 0.045);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(start.width * 1.33, 0.37),
    new THREE.MeshStandardMaterial({
      map: labelTexture("VELOCITY  /  FINISH", "#f3e8d1", "#254538"),
      side: THREE.DoubleSide,
      roughness: 0.7,
    }),
  );
  banner.position.set(0, 3.05, 0.06);
  gate.add(banner);
  const checkerCanvas = document.createElement("canvas");
  checkerCanvas.width = 256;
  checkerCanvas.height = 64;
  const ctx = checkerCanvas.getContext("2d")!;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#faf2df" : "#20372d";
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  const checkerTex = new THREE.CanvasTexture(checkerCanvas);
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(start.width * 0.96, 0.65),
    new THREE.MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.7,
      side: THREE.DoubleSide,
    }),
  );
  finish.rotation.x = -Math.PI / 2;
  finish.position.y = 0.045;
  gate.add(finish);
  // Small numbered miniature direction signs live outside the race surface.
  for (
    let i = 0;
    i < points.length;
    i += Math.max(1, Math.floor(points.length / 8))
  ) {
    const p = points[i];
    if (p.up[1] < 0.7) continue;
    const g = new THREE.Group();
    g.position.copy(vec(p.center)).addScaledVector(vec(p.right), p.width * 0.8);
    root.add(g);
    cylinder(g, 0.035, 0.75, [0, 0.32, 0], sage, 8);
    box(g, [0.65, 0.4, 0.05], [0, 0.85, 0], sage, 0.025);
    const t = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.3),
      new THREE.MeshStandardMaterial({
        map: labelTexture("››", "#234639", "#e8d2a3"),
        side: THREE.DoubleSide,
      }),
    );
    t.position.set(0, 0.85, 0.035);
    g.add(t);
    g.quaternion.copy(trackOrientation(p));
  }
  return {
    root,
    points,
    surface: road,
    bounds: new THREE.Box3().setFromPoints(points.map((p) => vec(p.center))),
  };
}
