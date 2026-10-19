import * as THREE from "three";
import type { TrackSample } from "../game/types";
import { vec } from "./shared";
import { TRACK_SURFACE_HEIGHT } from "./geometry";

/** A pair of luminous rails follows the same continuous road frames. */
export function buildTrackLights(points: TrackSample[]) {
  const root = new THREE.Group(),
    positions: number[] = [],
    indices: number[] = [];
  for (const side of [-1, 1]) {
    const offset = positions.length / 3;
    for (let i = 0; i <= points.length; i++) {
      const point = points[i % points.length];
      for (const edge of [-1, 1]) {
        const p = vec(point.center)
          .addScaledVector(
            vec(point.right),
            side * point.width * 0.448 + edge * 0.026,
          )
          .addScaledVector(vec(point.up), TRACK_SURFACE_HEIGHT + 0.0004);
        positions.push(p.x, p.y, p.z);
      }
      if (i < points.length) {
        const a = offset + i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
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
  const light = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: "#99ecff",
      emissive: "#6ce5ff",
      emissiveIntensity: 8,
      roughness: 0.22,
      metalness: 0.2,
      side: THREE.DoubleSide,
    }),
  );
  light.name = "continuous-cyan-guide-rails";
  root.add(light);
  return root;
}
