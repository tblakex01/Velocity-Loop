import * as THREE from "three";
import type { TrackSample } from "../game/types";
import {
  TRACK_SURFACE_HEIGHT,
  TRACK_LIP_HEIGHT,
  TRACK_LIP_INNER_RATIO,
  TRACK_LIP_OUTER_RATIO,
  trackHalfWidth,
} from "./geometry";
import { vec } from "./shared";

export function createTrackGeometry(points: readonly TrackSample[]) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  // The same closed molded cross-section is rendered and queried for occlusion.
  const profile = [
    [-TRACK_LIP_OUTER_RATIO, -0.14],
    [-TRACK_LIP_OUTER_RATIO, TRACK_LIP_HEIGHT],
    [-TRACK_LIP_INNER_RATIO, TRACK_LIP_HEIGHT],
    [-TRACK_LIP_INNER_RATIO, TRACK_SURFACE_HEIGHT],
    [TRACK_LIP_INNER_RATIO, TRACK_SURFACE_HEIGHT],
    [TRACK_LIP_INNER_RATIO, TRACK_LIP_HEIGHT],
    [TRACK_LIP_OUTER_RATIO, TRACK_LIP_HEIGHT],
    [TRACK_LIP_OUTER_RATIO, -0.14],
  ];
  for (let i = 0; i <= points.length; i++) {
    const p = points[i % points.length],
      center = vec(p.center),
      right = vec(p.right),
      up = vec(p.up);
    for (let j = 0; j < profile.length; j++) {
      const v = center
        .clone()
        .addScaledVector(right, profile[j][0] * trackHalfWidth(p.width))
        .addScaledVector(up, profile[j][1]);
      positions.push(v.x, v.y, v.z);
      uvs.push(j / 7, i * 0.12);
    }
    if (i < points.length)
      for (let j = 0; j < 8; j++) {
        const a = i * 8 + j,
          b = i * 8 + ((j + 1) % 8),
          c = a + 8,
          d = b + 8;
        indices.push(a, c, b, b, c, d);
      }
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
  geometry.computeBoundingSphere();
  return geometry;
}
