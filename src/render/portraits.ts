import * as THREE from "three";
import { CARS } from "../game/definitions";
import type { CarId } from "../game/types";
import { createCar } from "./car";
import { disposeObject } from "./shared";

/** Portraits use the same meshes, materials and livery as the playable cars. */
export function renderCarPortraits(
  renderer: THREE.WebGLRenderer,
  environment: THREE.Texture,
): Record<CarId, string> {
  const width = 512,
    height = 256;
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.samples = 4;
  const previousTarget = renderer.getRenderTarget(),
    previousViewport = renderer.getViewport(new THREE.Vector4()),
    previousScissor = renderer.getScissor(new THREE.Vector4()),
    previousScissorTest = renderer.getScissorTest(),
    previousColor = renderer.getClearColor(new THREE.Color()),
    previousAlpha = renderer.getClearAlpha(),
    previousExposure = renderer.toneMappingExposure;
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 1.2;
  const hemi = new THREE.HemisphereLight("#ffffff", "#647385", 2.2);
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#fff6e6", 4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#adc9ff", 2);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(29, width / height, 0.05, 30);
  camera.position.set(2.0, 1.05, 2.4);
  camera.lookAt(0, 0.3, 0);
  const pixels = new Uint8Array(width * height * 4),
    flipped = new Uint8ClampedArray(pixels.length);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Car portraits require a 2D canvas.");
  const portraits = {} as Record<CarId, string>;
  try {
    renderer.setScissorTest(false);
    renderer.setClearColor("#000000", 0);
    renderer.toneMappingExposure = 1;
    renderer.setRenderTarget(target);
    for (const definition of CARS) {
      const model = createCar(definition);
      model.root.position.y = 0.008;
      scene.add(model.root);
      // Pixel readback binds the resolved framebuffer. Rebind the MSAA draw
      // framebuffer for every model before rendering the next portrait.
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      for (let y = 0; y < height; y++)
        flipped.set(
          pixels.subarray(y * width * 4, (y + 1) * width * 4),
          (height - y - 1) * width * 4,
        );
      context.putImageData(new ImageData(flipped, width, height), 0, 0);
      portraits[definition.id] = canvas.toDataURL("image/png");
      scene.remove(model.root);
      disposeObject(model.root);
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.toneMappingExposure = previousExposure;
    target.dispose();
  }
  return portraits;
}
