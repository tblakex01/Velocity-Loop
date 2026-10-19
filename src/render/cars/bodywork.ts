import * as THREE from "three";
import type { CarDefinition } from "../../game/types";
import {
  BODY_FLOOR_HEIGHT,
  BODY_SECTIONS,
  WHEEL,
  WHEEL_RADIUS,
} from "../geometry";

export function sculptedSections(shape: CarDefinition["body"], count = 80) {
  const curve = new THREE.CatmullRomCurve3(
    BODY_SECTIONS[shape].map(([z, w, h]) => new THREE.Vector3(z, w, h)),
    false,
    "centripetal",
  );
  return Array.from({ length: count + 1 }, (_, i) => {
    const p = curve.getPoint(i / count);
    return [p.x, Math.min(0.515, p.y), p.z];
  });
}
function archFloor(z: number) {
  const radius = WHEEL_RADIUS + 0.023;
  return WHEEL.axleZ.reduce(
    (height, axle) =>
      Math.abs(z - axle) < radius
        ? Math.max(
            height,
            WHEEL.centerY + Math.sqrt(radius * radius - (z - axle) ** 2),
          )
        : height,
    BODY_FLOOR_HEIGHT,
  );
}

export function createBodyShell(shape: CarDefinition["body"]) {
  const positions: number[] = [],
    indices: number[] = [],
    uvs: number[] = [],
    sections = sculptedSections(shape);
  const ringSize = 14;
  for (let i = 0; i < sections.length; i++) {
    const [z, width, height] = sections[i],
      floor = archFloor(z);
    const shoulder = Math.max(
      height + (shape === "muscle" ? 0.035 : 0.045),
      floor + 0.044,
    );
    const crown =
      shape === "wedge" ? 0.005 : shape === "muscle" ? 0.008 : 0.025;
    const ring = [
      [-width * 0.69, BODY_FLOOR_HEIGHT],
      [-width * 0.96, floor],
      [-width, shoulder - 0.018],
      [-width * 0.87, shoulder],
      [-width * 0.66, height + 0.012],
      [-width * 0.37, height + crown],
      [0, height + crown + 0.004],
      [width * 0.37, height + crown],
      [width * 0.66, height + 0.012],
      [width * 0.87, shoulder],
      [width, shoulder - 0.018],
      [width * 0.96, floor],
      [width * 0.69, BODY_FLOOR_HEIGHT],
      [0, BODY_FLOOR_HEIGHT],
    ];
    for (let j = 0; j < ringSize; j++) {
      const [x, y] = ring[j];
      positions.push(x, y, z);
      uvs.push(j / (ringSize - 1), i / (sections.length - 1));
    }
    if (i < sections.length - 1)
      for (let j = 0; j < ringSize; j++) {
        const a = i * ringSize + j,
          b = i * ringSize + ((j + 1) % ringSize),
          c = a + ringSize,
          d = b + ringSize;
        indices.push(a, c, b, b, c, d);
      }
  }
  for (let j = 1; j < ringSize - 1; j++) {
    indices.push(0, j, j + 1);
    const end = (sections.length - 1) * ringSize;
    indices.push(end, end + j + 1, end + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function ribbon(
  parent: THREE.Group,
  points: THREE.Vector3[],
  width: number,
  material: THREE.Material,
  name: string,
) {
  const curve = new THREE.CatmullRomCurve3(points),
    positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 32; i++) {
    const p = curve.getPoint(i / 32);
    positions.push(p.x - width / 2, p.y, p.z, p.x + width / 2, p.y, p.z);
    if (i < 32) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export function tube(
  parent: THREE.Group,
  points: number[][],
  radius: number,
  material: THREE.Material,
  name: string,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
  );
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 18, radius, 5, false),
    material,
  );
  mesh.name = name;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function panel(
  parent: THREE.Group,
  vertices: number[][],
  material: THREE.Material,
  name: string,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices.flat(), 3),
  );
  const indices: number[] = [];
  for (let i = 1; i < vertices.length - 1; i++) indices.push(0, i, i + 1);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export type CarPalette = {
  paint: THREE.MeshPhysicalMaterial;
  chrome: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
};
export function createPalette(definition: CarDefinition): CarPalette {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: definition.color,
      metalness: 0.62,
      roughness: 0.19,
      clearcoat: 1,
      clearcoatRoughness: 0.11,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: "#e7e7e4",
      metalness: 0.96,
      roughness: 0.17,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: "#101719",
      metalness: 0.35,
      roughness: 0.48,
      side: THREE.DoubleSide,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#121414",
      roughness: 0.93,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#162a32",
      metalness: 0.3,
      roughness: 0.07,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      side: THREE.DoubleSide,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: definition.accent,
      metalness: 0.45,
      roughness: 0.3,
      side: THREE.DoubleSide,
    }),
    head: new THREE.MeshStandardMaterial({
      color: "#edfbff",
      emissive: "#c9eaff",
      emissiveIntensity: 1.3,
      roughness: 0.15,
    }),
    tail: new THREE.MeshStandardMaterial({
      color: "#f51b22",
      emissive: "#ff1821",
      emissiveIntensity: 1.8,
      roughness: 0.23,
    }),
    leather: new THREE.MeshStandardMaterial({
      color: "#343333",
      roughness: 0.85,
    }),
  };
}
