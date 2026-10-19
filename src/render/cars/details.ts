import * as THREE from "three";
import type { CarDefinition } from "../../game/types";
import { box } from "../shared";
import { BODY_SECTIONS, SPLITTER, DIFFUSER } from "../geometry";
import {
  panel,
  ribbon,
  sculptedSections,
  tube,
  type CarPalette,
} from "./bodywork";

function ellipsoid(
  parent: THREE.Group,
  scale: number[],
  position: number[],
  material: THREE.Material,
  name: string,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material);
  mesh.scale.fromArray(scale);
  mesh.position.fromArray(position);
  mesh.name = name;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function grille(
  parent: THREE.Group,
  p: CarPalette,
  width: number,
  height: number,
  y: number,
  z: number,
  name: string,
) {
  const inset = box(parent, [width, height, 0.026], [0, y, z], p.dark, 0.018);
  inset.name = name;
  const slats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width * 0.91, 0.009, 0.012),
    p.dark,
    5,
  );
  slats.name = `${name}-slats`;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    dummy.position.set(0, y - height * 0.36 + i * height * 0.18, z + 0.019);
    dummy.updateMatrix();
    slats.setMatrixAt(i, dummy.matrix);
  }
  parent.add(slats);
}
function rearDiffuser(
  parent: THREE.Group,
  p: CarPalette,
  tail: number,
  widen = false,
) {
  const tray = box(
    parent,
    [
      widen ? DIFFUSER.trayWidth : 0.75,
      DIFFUSER.trayHeight,
      DIFFUSER.trayDepth,
    ],
    [0, DIFFUSER.trayY, tail + DIFFUSER.trayTailOffset],
    p.dark,
    0.014,
  );
  tray.name = "carbon-rear-diffuser";
  for (const x of DIFFUSER.finX) {
    const fin = box(
      parent,
      [DIFFUSER.finWidth, DIFFUSER.finHeight, DIFFUSER.finDepth],
      [x, DIFFUSER.finY, tail - DIFFUSER.finTailOffset],
      p.dark,
      0.008,
    );
    fin.rotation.x = DIFFUSER.finPitch;
    fin.name = "diffuser-fin";
  }
}
function exotic(
  parent: THREE.Group,
  p: CarPalette,
  headlights: THREE.Mesh[],
  nose: number,
  tail: number,
) {
  // The sharp Y lamps, ventilated rear deck and central exhaust carry the new reference.
  grille(parent, p, 0.59, 0.11, 0.24, nose + 0.024, "gt-wide-front-grille");
  for (const side of [-1, 1]) {
    const housing = ellipsoid(
      parent,
      [0.12, 0.035, 0.042],
      [side * 0.255, 0.3, nose + 0.012],
      p.dark,
      "gt-headlight-housing",
    );
    housing.rotation.z = side * 0.14;
    const lamp = ellipsoid(
      parent,
      [0.104, 0.018, 0.027],
      [side * 0.255, 0.306, nose + 0.032],
      p.head,
      "gt-swept-white-headlamp",
    );
    lamp.rotation.z = side * 0.14;
    headlights.push(lamp);
    panel(
      parent,
      [
        [side * 0.465, 0.285, 0.28],
        [side * 0.482, 0.34, -0.03],
        [side * 0.49, 0.41, -0.27],
        [side * 0.445, 0.32, -0.34],
      ],
      p.dark,
      "gt-sculpted-side-intake",
    );
    box(
      parent,
      [0.031, 0.085, 0.38],
      [side * 0.459, 0.25, -0.08],
      p.dark,
      0.008,
    ).name = "gt-carbon-side-sill";
    const rearVent = box(
      parent,
      [0.245, 0.092, 0.034],
      [side * 0.255, 0.282, tail - 0.018],
      p.dark,
      0.012,
    );
    rearVent.name = "gt-rear-vent-cluster";
    tube(
      parent,
      [
        [side * 0.43, 0.378, tail - 0.026],
        [side * 0.22, 0.374, tail - 0.046],
        [side * 0.15, 0.397, tail - 0.031],
      ],
      0.014,
      p.tail,
      "gt-angular-red-led",
    );
    for (const offset of [0.23, 0.29, 0.35])
      tube(
        parent,
        [
          [side * (offset + 0.027), 0.384, tail - 0.046],
          [side * offset, 0.363, tail - 0.049],
          [side * (offset + 0.026), 0.345, tail - 0.045],
        ],
        0.007,
        p.tail,
        "gt-led-chevron",
      );
  }
  const engine = box(
    parent,
    [0.39, 0.024, 0.46],
    [0, 0.463, -0.79],
    p.glass,
    0.02,
  );
  engine.name = "gt-midengine-glass-deck";
  for (let i = 0; i < 7; i++) {
    const slat = box(
      parent,
      [0.4, 0.022, 0.032],
      [0, 0.488, -0.58 - i * 0.056],
      p.dark,
      0.006,
    );
    slat.rotation.x = -0.1;
    slat.name = "gt-engine-louver";
  }
  for (const side of [-1, 1]) {
    const buttress = ellipsoid(
      parent,
      [0.08, 0.037, 0.265],
      [side * 0.26, 0.461, -0.78],
      p.paint,
      "gt-rear-buttress",
    );
    buttress.rotation.y = side * 0.08;
  }
  const ducktail = box(
    parent,
    [0.92, 0.037, 0.12],
    [0, 0.484, -1.08],
    p.paint,
    0.027,
  );
  ducktail.rotation.x = -0.14;
  ducktail.name = "gt-integrated-ducktail";
  rearDiffuser(parent, p, tail, true);
}
function roadster(
  parent: THREE.Group,
  p: CarPalette,
  headlights: THREE.Mesh[],
  nose: number,
  tail: number,
) {
  grille(
    parent,
    p,
    0.4,
    0.073,
    0.249,
    nose + 0.026,
    "comet-compact-smiling-grille",
  );
  for (const side of [-1, 1]) {
    const lamp = ellipsoid(
      parent,
      [0.082, 0.052, 0.029],
      [side * 0.248, 0.333, nose + 0.005],
      p.head,
      "comet-oval-headlamp",
    );
    lamp.rotation.y = side * 0.15;
    headlights.push(lamp);
    ellipsoid(
      parent,
      [0.082, 0.033, 0.025],
      [side * 0.266, 0.341, tail - 0.014],
      p.tail,
      "comet-oval-tail-light",
    );
    tube(
      parent,
      [
        [side * 0.42, 0.3, -0.48],
        [side * 0.457, 0.29, -0.1],
        [side * 0.435, 0.29, 0.38],
      ],
      0.009,
      p.chrome,
      "comet-bright-rocker-line",
    );
    box(
      parent,
      [0.016, 0.025, 0.09],
      [side * 0.455, 0.397, -0.19],
      p.chrome,
      0.007,
    ).name = "comet-flush-door-handle";
  }
  const bumper = box(
    parent,
    [0.72, 0.038, 0.055],
    [0, 0.226, tail - 0.027],
    p.chrome,
    0.019,
  );
  bumper.name = "comet-rounded-rear-bumper";
}
function prototype(
  parent: THREE.Group,
  p: CarPalette,
  headlights: THREE.Mesh[],
  nose: number,
  tail: number,
) {
  grille(parent, p, 0.62, 0.071, 0.226, nose + 0.02, "apex-shark-front-intake");
  for (const side of [-1, 1]) {
    const lamp = box(
      parent,
      [0.17, 0.022, 0.023],
      [side * 0.248, 0.282, nose - 0.011],
      p.head,
      0.007,
    );
    lamp.rotation.z = side * -0.11;
    lamp.name = "apex-blade-headlight";
    headlights.push(lamp);
    panel(
      parent,
      [
        [side * 0.463, 0.25, 0.26],
        [side * 0.489, 0.34, 0.075],
        [side * 0.497, 0.403, -0.2],
        [side * 0.453, 0.271, -0.34],
      ],
      p.dark,
      "apex-deep-side-vent",
    );
    for (let i = 0; i < 3; i++)
      box(
        parent,
        [0.012, 0.051, 0.037],
        [side * 0.494, 0.323, -0.07 - i * 0.067],
        p.paint,
        0.003,
      ).name = "apex-side-intake-fin";
    box(
      parent,
      [0.37, 0.018, 0.024],
      [side * 0.23, 0.363, tail - 0.014],
      p.tail,
      0.004,
    ).name = "apex-wide-red-tail-blade";
    box(
      parent,
      [0.017, 0.131, 0.22],
      [side * 0.505, 0.609, -1.025],
      p.dark,
      0.008,
    ).name = "apex-wing-endplate";
    box(
      parent,
      [0.029, 0.17, 0.055],
      [side * 0.31, 0.48, -0.96],
      p.dark,
      0.006,
    ).name = "apex-wing-stanchion";
  }
  const wing = box(
    parent,
    [1.025, 0.037, 0.237],
    [0, 0.605, -1.0],
    p.dark,
    0.013,
  );
  wing.rotation.x = -0.07;
  wing.name = "apex-high-aero-wing";
  for (let i = 0; i < 6; i++) {
    const vent = box(
      parent,
      [0.31, 0.017, 0.033],
      [0, 0.414, -0.73 - i * 0.055],
      p.dark,
      0.004,
    );
    vent.name = "apex-rear-deck-extractor";
  }
  rearDiffuser(parent, p, tail, true);
}
function muscle(
  parent: THREE.Group,
  p: CarPalette,
  headlights: THREE.Mesh[],
  nose: number,
  tail: number,
) {
  grille(
    parent,
    p,
    0.65,
    0.13,
    0.319,
    nose + 0.026,
    "titan-black-retro-grille",
  );
  for (const side of [-1, 1])
    for (const x of [0.205, 0.329]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.045, 0.008, 7, 18),
        p.chrome,
      );
      ring.position.set(side * x, 0.347, nose + 0.056);
      ring.name = "titan-round-lamp-chrome-ring";
      parent.add(ring);
      const lamp = ellipsoid(
        parent,
        [0.037, 0.037, 0.013],
        [side * x, 0.347, nose + 0.055],
        p.head,
        "titan-quad-round-headlamp",
      );
      headlights.push(lamp);
    }
  const hood = box(
    parent,
    [0.28, 0.045, 0.46],
    [0, 0.49, 0.64],
    p.paint,
    0.027,
  );
  hood.name = "titan-hood-power-bulge";
  box(parent, [0.185, 0.029, 0.031], [0, 0.498, 0.879], p.dark, 0.007).name =
    "titan-hood-scoop";
  for (const z of [nose + 0.04, tail - 0.04])
    box(parent, [0.89, 0.051, 0.071], [0, 0.251, z], p.chrome, 0.012).name =
      "titan-chrome-bumper";
  for (const side of [-1, 1]) {
    box(
      parent,
      [0.25, 0.068, 0.025],
      [side * 0.26, 0.363, tail - 0.031],
      p.tail,
      0.007,
    ).name = "titan-wide-retro-tail-lamp";
    tube(
      parent,
      [
        [side * 0.474, 0.414, -0.79],
        [side * 0.492, 0.417, -0.12],
        [side * 0.469, 0.414, 0.58],
      ],
      0.009,
      p.chrome,
      "titan-straight-beltline",
    );
    box(
      parent,
      [0.017, 0.028, 0.09],
      [side * 0.479, 0.421, -0.26],
      p.chrome,
      0.006,
    ).name = "titan-chrome-door-handle";
  }
}

function livery(
  parent: THREE.Group,
  shape: CarDefinition["body"],
  p: CarPalette,
) {
  const sections = sculptedSections(shape);
  const spans =
    shape === "gt"
      ? [
          [0.48, 1.19],
          [-1.16, -1.03],
        ]
      : shape === "compact"
        ? [
            [0.32, 1.0],
            [-0.99, -0.82],
          ]
        : shape === "wedge"
          ? [[0.48, 1.2]]
          : [
              [0.34, 1.14],
              [-1.17, -0.81],
            ];
  for (const [from, to] of spans)
    for (const x of shape === "wedge" ? [0] : [-0.075, 0.075]) {
      const points = sections
        .filter(([z]) => z >= from && z <= to)
        .map(([z, , h]) => new THREE.Vector3(x, h + 0.032, z));
      if (points.length > 2)
        ribbon(
          parent,
          points,
          shape === "muscle" ? 0.075 : 0.028,
          p.accent,
          `${shape}-racing-pinstripe`,
        );
    }
}
export function buildDetails(
  parent: THREE.Group,
  shape: CarDefinition["body"],
  p: CarPalette,
) {
  const sections = BODY_SECTIONS[shape],
    nose = sections.at(-1)![0],
    tail = sections[0][0],
    headlights: THREE.Mesh[] = [];
  ({ gt: exotic, compact: roadster, wedge: prototype, muscle })[shape](
    parent,
    p,
    headlights,
    nose,
    tail,
  );
  const splitter = box(
    parent,
    [SPLITTER.width, SPLITTER.height, SPLITTER.depth],
    [0, SPLITTER.centerY, nose + SPLITTER.noseOffset],
    p.dark,
    0.012,
  );
  splitter.name = `${shape}-front-splitter`;
  livery(parent, shape, p);
  return headlights;
}
