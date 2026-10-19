import * as THREE from "three";
import type { CarDefinition } from "../game/types";
import { CHASSIS, WHEEL } from "./geometry";
import { box } from "./shared";
import { createBodyShell, createPalette } from "./cars/bodywork";
import { buildCabin } from "./cars/cabins";
import { buildDetails } from "./cars/details";
import { buildExhaust } from "./cars/exhaust";
import { buildWheel } from "./cars/wheels";

export type CarModel = {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  exhaust: THREE.Group;
  lights: THREE.Mesh[];
  contact: THREE.Mesh | null;
  shape: CarDefinition["body"];
  exhaustAnchors: THREE.Vector3[];
};

function contactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 12, 64, 64, 64);
  gradient.addColorStop(0, "rgba(20, 13, 8, 0.5)");
  gradient.addColorStop(0.7, "rgba(20, 13, 8, 0.24)");
  gradient.addColorStop(1, "rgba(20, 13, 8, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.23, 2.65),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  contact.name = "contact-shadow";
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.001;
  return contact;
}

/** One canonical authored model is used by garage portraits, racing and replays. */
export function createCar(definition: CarDefinition, ghost = false): CarModel {
  const root = new THREE.Group(),
    body = new THREE.Group(),
    shape = definition.body,
    palette = createPalette(definition);
  root.name = definition.id;
  body.name = `${shape}-coachwork`;
  root.add(body);
  const shell = new THREE.Mesh(createBodyShell(shape), palette.paint);
  shell.name = `${shape}-sculpted-wheel-arch-shell`;
  shell.castShadow = true;
  shell.receiveShadow = true;
  body.add(shell);
  const chassis = box(
    body,
    [CHASSIS.width, CHASSIS.height, CHASSIS.length],
    [0, CHASSIS.centerY, 0],
    palette.dark,
    0.03,
  );
  chassis.name = "carbon-undertray";
  buildCabin(body, shape, palette);
  const lights = buildDetails(body, shape, palette);
  const wheels: THREE.Group[] = [],
    frontWheels: THREE.Group[] = [];
  for (const x of WHEEL.axleX)
    for (const z of WHEEL.axleZ) {
      const wheel = buildWheel(root, x, z, shape, palette);
      wheels.push(wheel);
      if (z > 0) frontWheels.push(wheel);
    }
  const { exhaust, anchors } = buildExhaust(body, shape, palette);
  if (ghost)
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          material.transparent = true;
          material.opacity = 0.045;
          material.depthWrite = false;
          if ("color" in material)
            (material as THREE.MeshStandardMaterial).color.set("#a6ece0");
        }
      }
    });
  if (ghost) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(shell.geometry, 16),
      new THREE.LineBasicMaterial({
        color: "#73e9ff",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    outline.name = "ghost-canonical-hull-outline";
    body.add(outline);
  }
  const contact = ghost ? null : contactShadow();
  if (contact) root.add(contact);
  return {
    root,
    body,
    wheels,
    frontWheels,
    exhaust,
    lights,
    contact,
    shape,
    exhaustAnchors: anchors,
  };
}
