import * as THREE from "three";
import type { TrackSample } from "../game/types";
import { damp, vec } from "./shared";
import { VEHICLE_ENVELOPE } from "./geometry";

export type CameraMode = "chase" | "hood" | "orbit";
function chaseFieldOfView(speed: number, aspect: number) {
  const vertical = THREE.MathUtils.degToRad(55 + Math.min(speed * 0.13, 6));
  // Preserve the horizontal racing view on a taller viewport. A fixed vertical
  // lens otherwise crops the vehicle whenever a hill pulls the camera closer.
  return THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(vertical / 2) * Math.max(1, 16 / 9 / aspect)),
  );
}
const occlusionRay = new THREE.Raycaster();
const rayDirection = new THREE.Vector3();
const collisionNormal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
// Keep both the camera near plane and the subject's line of sight before the
// first actual road/lip intersection. This also handles orbit views and hills.
export function avoidRoadOcclusion(
  surface: THREE.Mesh,
  subject: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  clearance: number,
) {
  const distance = rayDirection.copy(cameraPosition).sub(subject).length();
  if (distance < 0.01) return;
  rayDirection.divideScalar(distance);
  surface.updateWorldMatrix(true, false);
  occlusionRay.set(subject, rayDirection);
  occlusionRay.near = 0.01;
  occlusionRay.far = distance + clearance;
  const intersection = occlusionRay.intersectObject(surface, false)[0];
  if (intersection?.face) {
    collisionNormal
      .copy(intersection.face.normal)
      .applyNormalMatrix(normalMatrix.getNormalMatrix(surface.matrixWorld));
    if (collisionNormal.dot(rayDirection) > 0) collisionNormal.negate();
    cameraPosition
      .copy(intersection.point)
      .addScaledVector(collisionNormal, clearance)
      .addScaledVector(rayDirection, -clearance * 0.25);
  }
}
export class CameraRig {
  private target = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private initialized = false;
  private viewportAspect = 0;
  reset() {
    this.initialized = false;
  }
  update(
    camera: THREE.PerspectiveCamera,
    position: THREE.Vector3,
    sample: TrackSample,
    ahead: TrackSample,
    chasePosition: THREE.Vector3,
    collisionSurface: THREE.Mesh,
    mode: CameraMode,
    menu: boolean,
    time: number,
    speed: number,
    dt: number,
  ) {
    const tangent = vec(sample.tangent),
      right = vec(sample.right),
      roadUp = vec(sample.up),
      desired = new THREE.Vector3(),
      look = new THREE.Vector3();
    const bend = THREE.MathUtils.clamp(
      Math.max(Math.abs(sample.curvature), Math.abs(ahead.curvature)) * 9,
      0,
      1,
    );
    let fov = 48;
    if (menu) {
      const mobile = camera.aspect < 1;
      const arc = Math.sin(time * 0.085) * 0.22;
      desired
        .copy(position)
        .addScaledVector(tangent, (mobile ? 4.5 : 3.7) + arc * 0.3)
        .addScaledVector(right, (mobile ? 8.5 : 7.0) + arc * 0.4)
        .addScaledVector(roadUp, mobile ? 1.4 : 1.1);
      look
        .copy(position)
        .addScaledVector(tangent, mobile ? 0.45 : 2.6)
        .addScaledVector(roadUp, -0.03);
      fov = mobile ? 58 : 48;
      if (mobile)
        camera.setViewOffset(
          camera.aspect * 1000,
          1000,
          0,
          340,
          camera.aspect * 1000,
          1000,
        );
      else camera.clearViewOffset();
    } else if (mode === "hood") {
      camera.clearViewOffset();
      desired
        .copy(position)
        .addScaledVector(tangent, 0.59)
        .addScaledVector(roadUp, 0.66);
      look.copy(vec(ahead.center)).addScaledVector(vec(ahead.up), 0.65);
      fov = 68;
    } else if (mode === "orbit") {
      camera.clearViewOffset();
      desired
        .copy(position)
        .addScaledVector(tangent, Math.sin(time * 0.2) * 10)
        .addScaledVector(right, Math.cos(time * 0.2) * 10)
        .addScaledVector(roadUp, 6);
      look.copy(position).addScaledVector(roadUp, 0.5);
      fov = 49;
    } else {
      camera.clearViewOffset();
      desired.copy(chasePosition);
      look
        .copy(vec(ahead.center))
        .lerp(position, 0.3 + bend * 0.62)
        .addScaledVector(roadUp, 0.45);
      fov = chaseFieldOfView(speed, camera.aspect);
    }
    // During a loop the horizon eases toward the road frame without instant camera inversion.
    if (!menu && camera.aspect !== this.viewportAspect) camera.fov = fov;
    this.viewportAspect = camera.aspect;
    const desiredUp = menu ? new THREE.Vector3(0, 1, 0) : roadUp.clone();
    if (!menu && mode === "chase" && roadUp.y > 0.1)
      desiredUp.lerp(new THREE.Vector3(0, 1, 0), 0.32).normalize();
    if (!this.initialized) {
      if (!menu) camera.fov = fov;
      camera.position.copy(desired);
      this.target.copy(look);
      this.up.copy(desiredUp);
      this.initialized = true;
    }
    const rate = menu ? 2 : mode === "hood" ? 20 : mode === "chase" ? 28 : 9;
    camera.position.lerp(desired, damp(rate, dt));
    if (!menu) {
      const halfHeight =
        camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const nearCornerRadius = Math.hypot(
        camera.near,
        halfHeight,
        halfHeight * camera.aspect,
      );
      avoidRoadOcclusion(
        collisionSurface,
        position.clone().addScaledVector(roadUp, 0.4),
        camera.position,
        nearCornerRadius + 0.04,
      );
    }
    if (!menu && mode === "chase") {
      const tight = THREE.MathUtils.clamp(
        (4.3 - camera.position.distanceTo(position)) / 1.3,
        0,
        1,
      );
      look.lerp(position.clone().addScaledVector(roadUp, 0.45), tight);
    }
    this.target.lerp(
      look,
      damp(rate + 2 + (!menu && mode === "chase" ? bend * 25 : 0), dt),
    );
    this.up.lerp(desiredUp, damp(mode === "hood" ? 16 : 6, dt)).normalize();
    camera.up.copy(this.up);
    camera.lookAt(this.target);
    camera.fov = THREE.MathUtils.lerp(camera.fov, fov, damp(5, dt));
    camera.updateProjectionMatrix();
    if (!menu && mode === "chase") this.frameVehicle(camera, position, sample);
  }
  private frameVehicle(
    camera: THREE.PerspectiveCamera,
    position: THREE.Vector3,
    sample: TrackSample,
  ) {
    const rotation = new THREE.Matrix4().makeBasis(
      vec(sample.right),
      vec(sample.up),
      vec(sample.tangent),
    );
    const corners: THREE.Vector3[] = [];
    for (const x of [-VEHICLE_ENVELOPE.halfWidth, VEHICLE_ENVELOPE.halfWidth])
      for (const y of [VEHICLE_ENVELOPE.bottom, VEHICLE_ENVELOPE.top])
        for (const z of [VEHICLE_ENVELOPE.rear, VEHICLE_ENVELOPE.front])
          corners.push(
            new THREE.Vector3(x, y, z).applyMatrix4(rotation).add(position),
          );
    // Keep the complete canonical model inside a small screen margin, including
    // on loop approach where a level look-ahead can suddenly point far upward.
    for (let iteration = 0; iteration < 3; iteration++) {
      camera.updateMatrixWorld();
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const corner of corners) {
        const p = corner.clone().project(camera);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const fittingScale = Math.max((maxX - minX) / 1.8, (maxY - minY) / 1.8);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      if (fittingScale > 1) {
        camera.fov = THREE.MathUtils.radToDeg(
          2 * Math.atan(tangent * fittingScale),
        );
        camera.updateProjectionMatrix();
        continue;
      }
      const dx = minX < -0.9 ? -0.9 - minX : maxX > 0.9 ? 0.9 - maxX : 0;
      const dy = minY < -0.9 ? -0.9 - minY : maxY > 0.9 ? 0.9 - maxY : 0;
      if (Math.abs(dx) + Math.abs(dy) < 0.002) break;
      const direction = new THREE.Vector3(
        -dx * tangent * camera.aspect,
        -dy * tangent,
        -1,
      )
        .normalize()
        .applyQuaternion(camera.quaternion);
      const lookDistance = camera.position.distanceTo(this.target);
      this.target
        .copy(camera.position)
        .addScaledVector(direction, lookDistance);
      camera.lookAt(this.target);
    }
  }
}
