import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { acceleratedRaycast } from "three-mesh-bvh";
import { COURSES } from "../src/game/definitions";
import { getTrackPoints, sampleTrack } from "../src/game/track";
import { getChasePosition, getVehiclePose } from "../src/render/contact";
import { avoidRoadOcclusion } from "../src/render/camera";
import { createTrackGeometry } from "../src/render/trackGeometry";

// CPU-only workload: fixed samples along every course, without WebGL or timers
// from the animation loop. Run on an otherwise idle machine; this is not FPS.
const count = 1000;
const repeats = 3;
function measure(run: () => void) {
  run();
  const start = performance.now();
  for (let i = 0; i < repeats; i++) run();
  return (performance.now() - start) / (count * repeats);
}
const rows = COURSES.map((course) => {
  const start = performance.now();
  const surface = new THREE.Mesh(
    createTrackGeometry(getTrackPoints(course.id)),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const setupMs = performance.now() - start;
  const distances = Array.from(
    { length: count },
    (_, i) => (course.length * i) / count,
  );
  const poseMs = measure(() => {
    for (const distance of distances)
      getVehiclePose(course.id, distance, 0.7, "gt", 0, 0.08, -0.009);
  });
  const rays = distances.map((distance) => {
    const sample = sampleTrack(course.id, distance);
    return {
      subject: new THREE.Vector3(...sample.center).addScaledVector(
        new THREE.Vector3(...sample.up),
        0.6,
      ),
      camera: getChasePosition(course.id, distance, 40, 0.7),
    };
  });
  const camera = new THREE.Vector3();
  const query = () => {
    for (const ray of rays)
      avoidRoadOcclusion(surface, ray.subject, camera.copy(ray.camera), 0.1);
  };
  const nativeRayMs = measure(query);
  surface.raycast = acceleratedRaycast;
  const indexedRayMs = measure(query);
  surface.geometry.dispose();
  surface.material.dispose();
  return {
    course: course.id,
    triangles: surface.geometry.index!.count / 3,
    setupMs: setupMs.toFixed(2),
    poseMs: poseMs.toFixed(4),
    nativeRayMs: nativeRayMs.toFixed(4),
    indexedRayMs: indexedRayMs.toFixed(4),
    raySpeedup: `${(nativeRayMs / indexedRayMs).toFixed(1)}x`,
  };
});
console.log(
  "Milliseconds per operation; 1,000 samples/course, 3 timed passes.",
);
console.table(rows);
