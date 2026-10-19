import * as THREE from "three";
import type { CarDefinition } from "../../game/types";
import { box, cylinder } from "../shared";
import { WHEEL } from "../geometry";
import type { CarPalette } from "./bodywork";

export const RIM_STYLES = {
  gt: "split-twenty",
  compact: "five-star",
  wedge: "twelve-turbine",
  muscle: "deep-dish-six",
} as const;
export function buildWheel(
  parent: THREE.Group,
  x: number,
  z: number,
  shape: CarDefinition["body"],
  p: CarPalette,
) {
  const steering = new THREE.Group();
  steering.position.set(x, WHEEL.centerY, z);
  steering.name = `${shape}-wheel`;
  parent.add(steering);
  const spin = new THREE.Group();
  spin.name = RIM_STYLES[shape];
  steering.add(spin);
  steering.userData.spin = spin;
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(
      WHEEL.tireMajorRadius,
      WHEEL.tireMinorRadius,
      16,
      40,
    ),
    p.rubber,
  );
  tire.rotation.y = Math.PI / 2;
  tire.name = "rubber-tire";
  tire.castShadow = true;
  spin.add(tire);
  const hub = cylinder(spin, 0.141, 0.128, [0, 0, 0], p.dark, 32);
  hub.rotation.z = Math.PI / 2;
  const outward = Math.sign(x) * WHEEL.rimOffset;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.125, WHEEL.rimTubeRadius, 8, 36),
    p.chrome,
  );
  ring.rotation.y = Math.PI / 2;
  ring.position.x = outward;
  ring.name = "polished-rim-lip";
  spin.add(ring);
  const rotor = cylinder(
    spin,
    0.113,
    0.008,
    [outward - Math.sign(x) * 0.025, 0, 0],
    p.chrome,
    28,
  );
  rotor.rotation.z = Math.PI / 2;
  rotor.name = "brake-disc";
  const caliper = box(
    steering,
    [0.029, 0.076, 0.033],
    [outward - Math.sign(x) * 0.021, 0.055, 0.074],
    p.accent,
    0.01,
  );
  caliper.name = "fixed-brake-caliper";
  const cap = cylinder(
    spin,
    shape === "muscle" ? 0.035 : 0.026,
    0.014,
    [outward, 0, 0],
    p.chrome,
    16,
  );
  cap.rotation.z = Math.PI / 2;
  const count =
    shape === "gt" ? 20 : shape === "compact" ? 5 : shape === "wedge" ? 12 : 6;
  let spokeGeometry: THREE.BufferGeometry;
  if (shape === "wedge") {
    const blade = new THREE.Shape();
    blade.moveTo(-0.018, 0.028);
    blade.lineTo(-0.04, 0.13);
    blade.lineTo(0.025, 0.134);
    blade.lineTo(0.032, 0.059);
    blade.closePath();
    spokeGeometry = new THREE.ExtrudeGeometry(blade, {
      depth: 0.012,
      bevelEnabled: false,
    });
    spokeGeometry.translate(0, 0, -0.006);
    spokeGeometry.rotateY(Math.PI / 2);
  } else
    spokeGeometry = new THREE.BoxGeometry(
      0.013,
      shape === "gt" ? 0.094 : 0.104,
      shape === "gt" ? 0.009 : shape === "compact" ? 0.033 : 0.039,
    );
  const spokes = new THREE.InstancedMesh(spokeGeometry, p.chrome, count);
  spokes.name = `${RIM_STYLES[shape]}-spokes`;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle =
      shape === "gt"
        ? (Math.floor(i / 2) * Math.PI) / 5 + (i % 2 ? 0.034 : -0.034)
        : (i * 2 * Math.PI) / count;
    dummy.position.set(
      outward,
      shape === "wedge" ? 0 : Math.cos(angle) * 0.074,
      shape === "wedge" ? 0 : Math.sin(angle) * 0.074,
    );
    dummy.rotation.set(
      angle + (shape === "compact" ? 0.09 : shape === "muscle" ? 0.03 : 0),
      0,
      0,
    );
    dummy.updateMatrix();
    spokes.setMatrixAt(i, dummy.matrix);
  }
  spin.add(spokes);
  const treads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(...(WHEEL.treadSize as [number, number, number])),
    p.rubber,
    40,
  );
  treads.name = "rubber-tread";
  for (let i = 0; i < 40; i++) {
    const a = (i * Math.PI) / 20;
    dummy.position.set(
      0,
      Math.cos(a) * WHEEL.treadCenterRadius,
      Math.sin(a) * WHEEL.treadCenterRadius,
    );
    dummy.rotation.set(a, 0, 0);
    dummy.updateMatrix();
    treads.setMatrixAt(i, dummy.matrix);
  }
  spin.add(treads);
  if (shape === "muscle") {
    const whitewall = new THREE.Mesh(
      new THREE.TorusGeometry(0.193, 0.006, 5, 40),
      p.accent,
    );
    whitewall.rotation.y = Math.PI / 2;
    whitewall.position.x = Math.sign(x) * 0.06;
    whitewall.name = "titan-thin-whitewall";
    spin.add(whitewall);
  }
  return steering;
}
