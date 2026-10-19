import * as THREE from "three";
import type { CarDefinition } from "../../game/types";
import { box } from "../shared";
import { panel, ribbon, tube, type CarPalette } from "./bodywork";

function curvedCanopy(
  parent: THREE.Group,
  sections: number[][],
  palette: CarPalette,
  base: number,
  name: string,
) {
  const curve = new THREE.CatmullRomCurve3(
    sections.map(([z, width, height]) => new THREE.Vector3(z, width, height)),
    false,
    "centripetal",
  );
  const positions: number[] = [],
    indices: number[] = [],
    around = 20,
    length = 38;
  for (let i = 0; i <= length; i++) {
    const p = curve.getPoint(i / length);
    for (let j = 0; j <= around; j++) {
      const a = (j * Math.PI) / around;
      positions.push(
        -p.y * Math.cos(a),
        base + (p.z - base) * Math.sin(a),
        p.x,
      );
      if (i < length && j < around) {
        const k = i * (around + 1) + j;
        indices.push(
          k,
          k + around + 1,
          k + 1,
          k + 1,
          k + around + 1,
          k + around + 2,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const glass = new THREE.Mesh(geometry, palette.glass);
  glass.name = name;
  parent.add(glass);
  return glass;
}
function mirrors(parent: THREE.Group, p: CarPalette, z: number, y: number) {
  for (const side of [-1, 1]) {
    tube(
      parent,
      [
        [side * 0.34, y - 0.03, z],
        [side * 0.41, y, z + 0.015],
      ],
      0.012,
      p.dark,
      "mirror-stalk",
    );
    const mirror = box(
      parent,
      [0.13, 0.062, 0.1],
      [side * 0.44, y, z],
      p.paint,
      0.024,
    );
    mirror.name = "sculpted-mirror";
    box(
      parent,
      [0.08, 0.034, 0.008],
      [side * 0.46, y, z - 0.047],
      p.chrome,
      0.012,
    );
  }
}
function exotic(parent: THREE.Group, p: CarPalette) {
  curvedCanopy(
    parent,
    [
      [-0.7, 0.1, 0.43],
      [-0.52, 0.29, 0.53],
      [-0.24, 0.34, 0.638],
      [0.03, 0.31, 0.625],
      [0.28, 0.27, 0.51],
      [0.49, 0.06, 0.405],
    ],
    p,
    0.405,
    "gt-curved-mid-cockpit",
  );
  ribbon(
    parent,
    [
      new THREE.Vector3(0, 0.638, -0.29),
      new THREE.Vector3(0, 0.651, -0.14),
      new THREE.Vector3(0, 0.64, 0.055),
    ],
    0.38,
    p.paint,
    "gt-tapered-roof",
  );
  for (const side of [-1, 1]) {
    tube(
      parent,
      [
        [side * 0.29, 0.418, 0.42],
        [side * 0.29, 0.525, 0.27],
        [side * 0.26, 0.625, 0.055],
      ],
      0.014,
      p.paint,
      "gt-curved-a-pillar",
    );
    tube(
      parent,
      [
        [side * 0.28, 0.43, -0.64],
        [side * 0.31, 0.51, -0.52],
        [side * 0.26, 0.64, -0.26],
      ],
      0.02,
      p.paint,
      "gt-flying-buttress",
    );
    tube(
      parent,
      [
        [side * 0.24, 0.634, -0.27],
        [side * 0.235, 0.653, -0.12],
        [side * 0.235, 0.638, 0.045],
      ],
      0.012,
      p.paint,
      "gt-roof-rail",
    );
  }
  mirrors(parent, p, 0.28, 0.46);
}
function roadster(parent: THREE.Group, p: CarPalette) {
  // Open central cockpit, two visible sculpted seats, low windshield and targa hoop.
  const cockpit = box(
    parent,
    [0.67, 0.075, 0.73],
    [0, 0.362, -0.12],
    p.dark,
    0.065,
  );
  cockpit.name = "comet-open-cockpit";
  panel(
    parent,
    [
      [-0.33, 0.408, 0.27],
      [0.33, 0.408, 0.27],
      [0.285, 0.632, 0.055],
      [-0.285, 0.632, 0.055],
    ],
    p.glass,
    "comet-windshield",
  );
  tube(
    parent,
    [
      [-0.34, 0.41, 0.28],
      [-0.3, 0.635, 0.055],
      [0, 0.648, 0.048],
      [0.3, 0.635, 0.055],
      [0.34, 0.41, 0.28],
    ],
    0.021,
    p.paint,
    "comet-windshield-frame",
  );
  for (const x of [-0.18, 0.18]) {
    const seat = box(
      parent,
      [0.235, 0.075, 0.245],
      [x, 0.407, -0.17],
      p.leather,
      0.025,
    );
    seat.name = "comet-visible-seat";
    const back = box(
      parent,
      [0.23, 0.19, 0.055],
      [x, 0.5, -0.29],
      p.leather,
      0.026,
    );
    back.rotation.x = -0.13;
    back.name = "comet-seat-back";
    box(parent, [0.1, 0.07, 0.055], [x, 0.612, -0.305], p.leather, 0.02);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), p.paint);
    hump.scale.set(0.15, 0.067, 0.26);
    hump.position.set(x, 0.435, -0.64);
    hump.name = "comet-rear-seat-hump";
    parent.add(hump);
  }
  tube(
    parent,
    [
      [-0.33, 0.41, -0.43],
      [-0.315, 0.637, -0.46],
      [-0.2, 0.681, -0.47],
      [0.2, 0.681, -0.47],
      [0.315, 0.637, -0.46],
      [0.33, 0.41, -0.43],
    ],
    0.026,
    p.chrome,
    "comet-targa-hoop",
  );
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.058, 0.011, 6, 18),
    p.dark,
  );
  wheel.rotation.x = -0.3;
  wheel.position.set(-0.18, 0.465, 0.05);
  parent.add(wheel);
  box(parent, [0.045, 0.055, 0.06], [0, 0.41, -0.03], p.chrome, 0.01);
  mirrors(parent, p, 0.22, 0.44);
}
function prototype(parent: THREE.Group, p: CarPalette) {
  curvedCanopy(
    parent,
    [
      [-0.68, 0.07, 0.36],
      [-0.44, 0.27, 0.53],
      [-0.12, 0.33, 0.608],
      [0.15, 0.28, 0.575],
      [0.43, 0.07, 0.345],
    ],
    p,
    0.338,
    "apex-wraparound-jet-canopy",
  );
  ribbon(
    parent,
    [
      new THREE.Vector3(0, 0.4, -0.65),
      new THREE.Vector3(0, 0.61, -0.15),
      new THREE.Vector3(0, 0.575, 0.15),
      new THREE.Vector3(0, 0.36, 0.42),
    ],
    0.046,
    p.paint,
    "apex-canopy-spine",
  );
  for (const side of [-1, 1])
    tube(
      parent,
      [
        [side * 0.085, 0.36, 0.41],
        [side * 0.28, 0.535, 0.14],
        [side * 0.32, 0.604, -0.11],
        [side * 0.24, 0.5, -0.46],
      ],
      0.012,
      p.dark,
      "apex-canopy-seal",
    );
  mirrors(parent, p, 0.2, 0.4);
}
function muscle(parent: THREE.Group, p: CarPalette) {
  for (const side of [-1, 1]) {
    panel(
      parent,
      [
        [side * 0.35, 0.46, -0.75],
        [side * 0.3, 0.69, -0.52],
        [side * 0.3, 0.69, 0.035],
        [side * 0.355, 0.46, 0.37],
      ],
      p.glass,
      "titan-trapezoid-side-window",
    );
    tube(
      parent,
      [
        [side * 0.355, 0.455, -0.76],
        [side * 0.306, 0.695, -0.52],
        [side * 0.306, 0.695, -0.48],
        [side * 0.306, 0.695, 0.0],
        [side * 0.306, 0.695, 0.04],
        [side * 0.36, 0.455, 0.38],
      ],
      0.021,
      p.paint,
      "titan-window-frame",
    );
    tube(
      parent,
      [
        [side * 0.33, 0.46, -0.18],
        [side * 0.304, 0.689, -0.18],
      ],
      0.02,
      p.dark,
      "titan-b-pillar",
    );
  }
  panel(
    parent,
    [
      [-0.355, 0.46, 0.37],
      [0.355, 0.46, 0.37],
      [0.3, 0.69, 0.04],
      [-0.3, 0.69, 0.04],
    ],
    p.glass,
    "titan-raked-windshield",
  );
  panel(
    parent,
    [
      [-0.35, 0.46, -0.75],
      [-0.3, 0.69, -0.52],
      [0.3, 0.69, -0.52],
      [0.35, 0.46, -0.75],
    ],
    p.glass,
    "titan-rear-window",
  );
  const roof = box(
    parent,
    [0.64, 0.028, 0.59],
    [0, 0.695, -0.245],
    p.paint,
    0.045,
  );
  roof.name = "titan-flat-retro-roof";
  mirrors(parent, p, 0.28, 0.49);
}
export function buildCabin(
  parent: THREE.Group,
  shape: CarDefinition["body"],
  palette: CarPalette,
) {
  ({ gt: exotic, compact: roadster, wedge: prototype, muscle })[shape](
    parent,
    palette,
  );
}
