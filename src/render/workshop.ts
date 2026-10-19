import * as THREE from "three";
import { box, cylinder, labelTexture } from "./shared";

export function buildWorkshop(bounds: THREE.Box3) {
  const root = new THREE.Group(),
    center = bounds.getCenter(new THREE.Vector3()),
    extent = bounds.getSize(new THREE.Vector3());
  const width = Math.max(135, extent.x + 42),
    depth = Math.max(100, extent.z + 40),
    wallZ = center.z - depth * 0.57;
  const plaster = new THREE.MeshStandardMaterial({
    color: "#e9e0c9",
    roughness: 0.98,
  });
  const oak = new THREE.MeshStandardMaterial({
    color: "#bd8b57",
    roughness: 0.65,
  });
  const sage = new THREE.MeshStandardMaterial({
    color: "#536858",
    roughness: 0.76,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#ba9b5b",
    metalness: 0.72,
    roughness: 0.31,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: "#63716b",
    metalness: 0.65,
    roughness: 0.42,
  });
  const terra = new THREE.MeshStandardMaterial({
    color: "#a45e44",
    roughness: 0.8,
  });
  const limestone = new THREE.MeshStandardMaterial({
    color: "#d2c9a9",
    roughness: 0.82,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: "#734732",
    roughness: 0.78,
  });
  const floor = new THREE.MeshStandardMaterial({
    color: "#968e78",
    roughness: 0.96,
  });
  const atlasMaterials = [
    plaster,
    oak,
    sage,
    brass,
    limestone,
    leather,
    terra,
    floor,
    steel,
  ];
  let alive = true;
  const atlas = new THREE.TextureLoader().load(
    "/assets/workshop-atlas.png",
    (texture) => {
      if (!alive) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      atlasMaterials.forEach((m, index) => {
        const t = texture.clone();
        t.repeat.set(0.329, 0.329);
        t.offset.set(
          (index % 3) / 3 + 0.002,
          (2 - Math.floor(index / 3)) / 3 + 0.002,
        );
        t.needsUpdate = true;
        m.map = t;
        m.needsUpdate = true;
      });
      texture.dispose();
    },
    undefined,
    () => {},
  );
  box(root, [width, 3, depth], [center.x, -2, center.z], oak, 0.5);
  // Board seams, beveled bench apron, and turned trestle legs establish the miniature scale.
  const seamMat = new THREE.MeshStandardMaterial({
    color: "#856541",
    roughness: 0.9,
  });
  for (let z = wallZ + 4; z < center.z + depth * 0.48; z += 8)
    box(root, [width - 0.8, 0.015, 0.035], [center.x, -0.49, z], seamMat);
  box(
    root,
    [width + 1, 4.5, 1.4],
    [center.x, -3.5, center.z + depth * 0.5],
    oak,
    0.3,
  );
  for (const x of [center.x - width * 0.38, center.x + width * 0.38])
    for (const z of [center.z - depth * 0.38, center.z + depth * 0.38])
      box(root, [4, 30, 4], [x, -19, z], sage, 0.5);
  box(root, [width * 2, 0.6, depth * 2], [center.x, -35, center.z], floor);
  box(root, [width * 1.7, 87, 1.2], [center.x, 8, wallZ - 8], plaster);
  for (let x = center.x - width * 0.75; x < center.x + width * 0.75; x += 24) {
    box(root, [0.28, 73, 0.6], [x, 4, wallZ - 7.2], limestone);
    box(root, [23, 0.3, 0.6], [x + 12, 25, wallZ - 7.2], limestone);
  }
  box(root, [width * 1.7, 5, 1.3], [center.x, -30, wallZ - 7], sage);
  // An oversized workshop window: softly luminous panes and painted timber mullions.
  const window = new THREE.Group();
  window.position.set(center.x - width * 0.26, 25, wallZ - 6.4);
  root.add(window);
  const sky = new THREE.MeshBasicMaterial({ color: "#fff0d1" });
  box(window, [30, 29, 0.25], [0, 0, 0], sage, 0.2);
  box(window, [27, 26, 0.28], [0, 0, 0.2], sky);
  for (const x of [-4.5, 4.5]) box(window, [0.45, 27, 0.5], [x, 0, 0.5], sage);
  for (const y of [-4.5, 4.5]) box(window, [28, 0.45, 0.5], [0, y, 0.5], sage);
  box(window, [34, 1.8, 3], [0, -15, 1], oak, 0.3);
  // Pegboard with first-party modeled tools, parts drawers, and a work lamp.
  const peg = new THREE.Group();
  peg.position.set(center.x + width * 0.22, 17, wallZ - 5.9);
  root.add(peg);
  box(peg, [26, 24, 1], [0, 0, 0], oak, 0.3);
  const holes = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.14, 6),
    seamMat,
    19 * 17,
  );
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let y = 0; y < 17; y++)
    for (let x = 0; x < 19; x++) {
      dummy.position.set(-11.7 + x * 1.3, -10.4 + y * 1.3, 0.52);
      dummy.updateMatrix();
      holes.setMatrixAt(n++, dummy.matrix);
    }
  peg.add(holes);
  for (let i = 0; i < 5; i++) {
    const tool = new THREE.Group();
    tool.position.set(-9 + i * 4.5, 3, 0.85);
    tool.rotation.z = (i - 2) * 0.08;
    peg.add(tool);
    box(tool, [0.5, 7, 0.4], [0, 0, 0], steel, 0.12);
    cylinder(tool, 0.52, 3.4, [0, -4.1, 0], i % 2 ? terra : sage);
    if (i % 2) {
      const head = cylinder(tool, 1.02, 0.38, [0, 4, 0], steel, 6);
      head.rotation.x = Math.PI / 2;
    } else box(tool, [2.7, 0.7, 0.65], [0, 4, 0], steel, 0.1);
  }
  box(root, [21, 8, 8], [center.x + width * 0.31, 3.6, wallZ + 3], sage, 0.3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 5; x++) {
      box(
        root,
        [3.7, 2, 0.1],
        [center.x + width * 0.31 - 8 + x * 4, 1.3 + y * 2.5, wallZ + 7.1],
        leather,
        0.08,
      );
      box(
        root,
        [0.7, 0.2, 0.18],
        [center.x + width * 0.31 - 8 + x * 4, 1.3 + y * 2.5, wallZ + 7.23],
        brass,
        0.035,
      );
    }
  const lamp = new THREE.Group();
  lamp.position.set(center.x + width * 0.4, 0, center.z - 8);
  root.add(lamp);
  cylinder(lamp, 3, 0.7, [0, 0, 0], sage, 24);
  const stem = cylinder(lamp, 0.2, 18, [0, 9, 0], brass);
  stem.rotation.z = 0.2;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(4, 4, 32, 1, true),
    new THREE.MeshStandardMaterial({
      color: "#344f42",
      roughness: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  shade.position.set(-3.8, 18, 0);
  lamp.add(shade);
  const lampLight = new THREE.PointLight("#ffe4b1", 38, 50, 2);
  lampLight.position.set(-3.8, 16, 0);
  lamp.add(lampLight);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 5),
    new THREE.MeshStandardMaterial({
      map: labelTexture("VELOCITY / WORKSHOP", "#e0d5b7", "#354b3c"),
      roughness: 0.9,
    }),
  );
  sign.position.set(center.x + width * 0.06, 35, wallZ - 7.1);
  root.add(sign);
  // Scale objects: measuring rule, oil tin, stacked notebooks, spare wheels, and plant.
  box(root, [25, 0.25, 2.2], [center.x - 30, -0.2, wallZ + 8], limestone, 0.08);
  for (let i = 0; i < 40; i++)
    box(
      root,
      [0.07, 0.035, i % 5 === 0 ? 1.1 : 0.55],
      [center.x - 42 + i * 0.6, -0.05, wallZ + 8.5],
      sage,
    );
  for (let i = 0; i < 3; i++) {
    const notebook = box(
      root,
      [12, 0.75, 8],
      [center.x + 8, i * 0.8, wallZ + 8],
      i === 1 ? leather : sage,
      0.18,
    );
    notebook.rotation.y = i * 0.05;
  }
  cylinder(root, 2.7, 7, [center.x - width * 0.42, 3, wallZ + 7], terra, 24);
  const lid = cylinder(
    root,
    2.8,
    0.3,
    [center.x - width * 0.42, 6.65, wallZ + 7],
    brass,
    24,
  );
  lid.receiveShadow = true;
  const plant = new THREE.Group();
  plant.position.set(center.x - width * 0.42, 0, center.z + depth * 0.3);
  root.add(plant);
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 2.5, 5, 24),
    terra,
  );
  pot.position.y = 2;
  pot.castShadow = true;
  plant.add(pot);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), sage);
    leaf.scale.set(0.7, 4, 0.3);
    leaf.position.set(Math.sin(a) * 2, 6 + (i % 3), Math.cos(a) * 2);
    leaf.rotation.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.4);
    plant.add(leaf);
  }
  // Warm dust shafts are intentionally subtle additive planes, not opaque scenery.
  const shaftMat = new THREE.MeshBasicMaterial({
    color: "#ffdeb0",
    transparent: true,
    opacity: 0.025,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 3; i++) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(8, 65), shaftMat);
    shaft.position.set(center.x - width * 0.26 + i * 8, 10, wallZ + 18);
    shaft.rotation.z = -0.6;
    shaft.rotation.y = 0.2;
    root.add(shaft);
  }
  return {
    root,
    cleanup() {
      alive = false;
      atlas.dispose();
    },
  };
}
