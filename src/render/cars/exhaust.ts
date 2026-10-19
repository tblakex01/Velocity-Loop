import * as THREE from "three";
import type { CarDefinition } from "../../game/types";
import { cylinder } from "../shared";
import { BODY_SECTIONS, EXHAUST } from "../geometry";
import type { CarPalette } from "./bodywork";

export const JET_LAYOUT = {
  gt: [0],
  compact: [-0.23, 0.23],
  wedge: [-0.12, 0.12],
  muscle: [-0.27, 0.27],
} as const;
export function buildExhaust(
  parent: THREE.Group,
  shape: CarDefinition["body"],
  p: CarPalette,
) {
  const tail = BODY_SECTIONS[shape][0][0],
    exhaust = new THREE.Group(),
    anchors: THREE.Vector3[] = [];
  exhaust.name = `${shape}-nitro-jets`;
  exhaust.position.set(0, EXHAUST.centerY, tail - 0.14);
  parent.add(exhaust);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#7deeff").multiplyScalar(6),
    transparent: true,
    opacity: 0.83,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#f6ffff").multiplyScalar(7),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  for (const x of JET_LAYOUT[shape]) {
    const radius = shape === "gt" ? 0.074 : EXHAUST.radius;
    const pipe = cylinder(
      parent,
      radius,
      EXHAUST.length,
      [x, EXHAUST.centerY, tail - EXHAUST.tailOffset],
      p.chrome,
      20,
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.name = "metal-exhaust-pipe";
    const darkHole = cylinder(
      parent,
      radius * 0.78,
      EXHAUST.rearCap,
      [
        x,
        EXHAUST.centerY,
        tail - EXHAUST.tailOffset - EXHAUST.length / 2 - EXHAUST.rearCap / 2,
      ],
      p.dark,
      20,
    );
    darkHole.rotation.x = Math.PI / 2;
    const anchor = new THREE.Vector3(x, EXHAUST.centerY, tail - 0.14);
    anchors.push(anchor);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 1.18, 0.72, 12),
      flameMaterial,
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0, -0.31);
    exhaust.add(flame);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.56, 0.44, 10),
      coreMaterial,
    );
    core.rotation.x = -Math.PI / 2;
    core.position.set(x, 0, -0.18);
    core.name = "nitro-white-hot-core";
    exhaust.add(core);
  }
  exhaust.visible = false;
  return { exhaust, anchors };
}
