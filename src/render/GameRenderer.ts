import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { CarId, CourseId, GhostFrame, RaceState } from "../game/types";
import { getCar, getCourse } from "../game/definitions";
import { sampleTrack } from "../game/track";
import { createCar, type CarModel } from "./car";
import { buildTrack } from "./track";
import { getVehiclePose, getChasePosition } from "./contact";
import { TRACK_SURFACE_HEIGHT, WHEEL_RADIUS } from "./geometry";
import { buildWorkshop } from "./workshop";
import { CameraRig, type CameraMode } from "./camera";
import { damp, disposeObject, vec } from "./shared";
import { renderCarPortraits } from "./portraits";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class GameRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.05, 650);
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  private bloomAllowed = true;
  private rig = new CameraRig();
  private observer: ResizeObserver;
  private courseId: CourseId = "double";
  private carId: CarId = "atelier";
  private mode: "menu" | "race" = "menu";
  private cameraMode: CameraMode = "chase";
  private quality: "auto" | "high" | "low" = "auto";
  private track: ReturnType<typeof buildTrack> | null = null;
  private workshop: ReturnType<typeof buildWorkshop> | null = null;
  private car: CarModel;
  private ghostCar: CarModel;
  private keyLight: THREE.DirectionalLight;
  private environment: THREE.WebGLRenderTarget;
  private elapsed = 0;
  private frameCost = 16;
  private performanceTime = 0;
  private pixelRatio = 1.5;
  private lost = false;
  private disposed = false;
  private previousDistance = 0;
  private menuDistance = 0;
  private portraits: Record<CarId, string> | null = null;
  private nitroLight = new THREE.PointLight("#55eaff", 0, 5, 2);
  private trail = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.07, 6, 4),
    new THREE.MeshBasicMaterial({
      color: "#79efff",
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    32,
  );
  private particles = Array.from({ length: 32 }, () => ({
    position: new THREE.Vector3(),
    life: 0,
  }));
  private particleCursor = 0;
  private particleDummy = new THREE.Object3D();
  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onStatus?.("Graphics paused. Restoring the workshop…");
  };
  private onRestored = () => {
    this.environment.dispose();
    this.environment = this.createEnvironment();
    this.composer.reset();
    this.lost = false;
    this.rig.reset();
    this.onStatus?.("");
  };

  constructor(
    private container: HTMLElement,
    private onStatus?: (status: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.83;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.composer = new EffectComposer(this.renderer);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.08, 3.5);
    this.output = new OutputPass();
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Three dimensional miniature racing workshop",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#d8cbb0");
    this.scene.fog = new THREE.Fog("#d8cbb0", 105, 300);
    this.environment = this.createEnvironment();
    this.scene.environmentIntensity = 0.9;
    this.trail.frustumCulled = false;
    this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.trail);
    this.scene.add(new THREE.HemisphereLight("#fff5de", "#483221", 0.85));
    this.keyLight = new THREE.DirectionalLight("#ffebc5", 2.4);
    this.keyLight.position.set(-38, 65, -40);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -38;
    this.keyLight.shadow.camera.right = 38;
    this.keyLight.shadow.camera.top = 38;
    this.keyLight.shadow.camera.bottom = -38;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 150;
    this.keyLight.shadow.normalBias = 0.045;
    this.keyLight.shadow.bias = -0.00015;
    this.scene.add(this.keyLight, this.keyLight.target);
    const rim = new THREE.DirectionalLight("#d8e5df", 1.2);
    rim.position.set(25, 30, 50);
    this.scene.add(rim);
    this.car = createCar(getCar(this.carId));
    this.ghostCar = createCar(getCar(this.carId), true);
    this.ghostCar.root.visible = false;
    this.scene.add(this.car.root, this.ghostCar.root);
    this.car.root.add(this.nitroLight);
    this.nitroLight.position.copy(this.car.exhaustAnchors[0]);
    this.setCourse(this.courseId);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onLost);
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.onRestored,
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  setCourse(id: string) {
    const definition = getCourse(id as CourseId);
    if (!definition) throw new Error(`Unknown course: ${id}`);
    if (definition.id === this.courseId && this.track) return;
    this.courseId = definition.id;
    if (this.track) {
      this.scene.remove(this.track.root);
      disposeObject(this.track.root);
    }
    if (this.workshop) {
      this.scene.remove(this.workshop.root);
      this.workshop.cleanup();
      disposeObject(this.workshop.root);
    }
    this.track = buildTrack(this.courseId);
    // Showcase the actual car on the far elevated straight. Both physical loop
    // arches sit behind it rather than passing immediately through the camera.
    let accumulated = 0,
      bestHeight = -Infinity;
    this.track.points.forEach((point, index, points) => {
      if (index)
        accumulated += vec(point.center).distanceTo(
          vec(points[index - 1].center),
        );
      if (
        point.tangent[0] < -0.98 &&
        point.up[1] > 0.95 &&
        Math.abs(point.tangent[1]) < 0.05 &&
        point.center[2] > 0 &&
        point.center[1] > bestHeight
      ) {
        bestHeight = point.center[1];
        this.menuDistance = accumulated;
      }
    });
    this.workshop = buildWorkshop(this.track.bounds);
    this.scene.add(this.workshop.root, this.track.root);
    this.rig.reset();
    this.previousDistance = 0;
  }
  setCar(id: string) {
    const definition = getCar(id as CarId);
    if (!definition) throw new Error(`Unknown car: ${id}`);
    if (definition.id === this.carId) return;
    this.carId = definition.id;
    this.scene.remove(this.car.root, this.ghostCar.root);
    this.car.root.remove(this.nitroLight);
    disposeObject(this.car.root);
    disposeObject(this.ghostCar.root);
    this.car = createCar(definition);
    this.ghostCar = createCar(definition, true);
    this.ghostCar.root.visible = false;
    this.car.root.add(this.nitroLight);
    this.nitroLight.position.copy(this.car.exhaustAnchors[0]);
    this.scene.add(this.car.root, this.ghostCar.root);
    this.rig.reset();
  }
  setMode(mode: "menu" | "race") {
    if (mode !== this.mode) {
      this.mode = mode;
      this.rig.reset();
      this.previousDistance = 0;
    }
  }
  setCamera(mode: CameraMode) {
    if (mode !== this.cameraMode) {
      this.cameraMode = mode;
      this.rig.reset();
    }
  }
  setQuality(quality: "auto" | "high" | "low") {
    if (quality === this.quality) return;
    this.quality = quality;
    this.pixelRatio =
      quality === "low"
        ? 1
        : Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.5);
    this.renderer.shadowMap.enabled = quality !== "low";
    this.resize();
  }
  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth),
      height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.pixelRatio),
    );
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }
  update(state: RaceState | null, dt: number, ghost: GhostFrame | null = null) {
    if (this.disposed || this.lost) return;
    dt = Math.max(0, Math.min(dt, 0.1));
    this.elapsed += dt;
    const menu = this.mode === "menu" || !state,
      distance = menu ? this.menuDistance : state.distance,
      speed = menu ? 0 : state.speed;
    const sample = sampleTrack(this.courseId, distance),
      ahead = sampleTrack(this.courseId, distance + Math.max(4, speed * 0.26));
    const wheelsDistance = menu
      ? 0
      : Math.max(-5, Math.min(5, distance - this.previousDistance));
    this.previousDistance = distance;
    for (const wheel of this.car.wheels)
      (wheel.userData.spin as THREE.Group).rotation.x +=
        wheelsDistance / WHEEL_RADIUS;
    const steer = menu
      ? 0
      : THREE.MathUtils.clamp(state.lateralVelocity * 0.045, -0.3, 0.3);
    for (const wheel of this.car.frontWheels)
      wheel.rotation.y = THREE.MathUtils.lerp(
        wheel.rotation.y,
        steer,
        damp(12, dt),
      );
    this.car.body.rotation.z = THREE.MathUtils.lerp(
      this.car.body.rotation.z,
      menu ? 0 : -state.lateralVelocity * 0.009,
      damp(10, dt),
    );
    this.car.body.position.y = menu
      ? 0
      : Math.sin(state.time * 32) * Math.min(speed * 0.00035, 0.009);
    this.placeCar(
      this.car,
      distance,
      menu ? 0 : state.lateral,
      menu ? 0 : state.airHeight,
    );
    this.car.exhaust.visible = !menu && state.boosting;
    for (const flame of this.car.exhaust.children)
      flame.scale.y = 1 + Math.sin(this.elapsed * 48) * 0.12;
    this.nitroLight.intensity = !menu && state.boosting ? 3 : 0;
    this.updateTrail(!menu && state.boosting, dt);
    this.ghostCar.root.visible = !menu && !!ghost;
    if (ghost)
      this.placeCar(
        this.ghostCar,
        ghost.distance,
        ghost.lateral,
        ghost.airHeight,
      );
    this.rig.update(
      this.camera,
      this.car.root.position,
      sample,
      ahead,
      getChasePosition(
        this.courseId,
        distance,
        speed,
        menu ? 0 : state.lateral,
      ),
      this.track!.surface,
      this.cameraMode,
      menu,
      this.elapsed,
      speed,
      dt,
    );
    this.car.root.visible = this.cameraMode !== "hood" || menu;
    // A moving shadow frustum maintains crisp toy-scale contact over a large workshop course.
    this.keyLight.target.position.copy(this.car.root.position);
    this.keyLight.position
      .copy(this.car.root.position)
      .add(new THREE.Vector3(-38, 65, -40));
    const start = performance.now();
    if (
      !menu &&
      this.quality !== "low" &&
      (this.quality === "high" || this.bloomAllowed)
    )
      this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.frameCost = THREE.MathUtils.lerp(
      this.frameCost,
      Math.max(performance.now() - start, dt * 1000),
      0.04,
    );
    this.performanceTime += dt;
    if (this.quality === "auto" && this.performanceTime > 4) {
      this.performanceTime = 0;
      if (this.frameCost > 25) this.bloomAllowed = false;
      const next =
        this.frameCost > 22
          ? Math.max(0.8, this.pixelRatio - 0.2)
          : this.frameCost < 11
            ? Math.min(1.7, this.pixelRatio + 0.1)
            : this.pixelRatio;
      if (Math.abs(next - this.pixelRatio) > 0.01) {
        this.pixelRatio = next;
        this.resize();
      }
    }
  }
  private placeCar(
    car: CarModel,
    distance: number,
    lateral: number,
    airHeight: number,
  ) {
    const pose = getVehiclePose(
      this.courseId,
      distance,
      lateral,
      car.shape,
      airHeight,
      car.body.rotation.z,
      car.body.position.y,
    );
    car.root.position.copy(pose.position);
    car.root.quaternion.copy(pose.quaternion);
    if (car.contact) {
      car.contact.visible = airHeight < 0.04;
      car.contact.position.y = TRACK_SURFACE_HEIGHT - pose.lift + 0.002;
    }
  }
  private createEnvironment() {
    const generator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.03);
    this.scene.environment = environment.texture;
    generator.dispose();
    room.dispose();
    return environment;
  }
  private updateTrail(boosting: boolean, dt: number) {
    if (!boosting && !this.trail.visible) return;
    if (boosting)
      for (const anchor of this.car.exhaustAnchors) {
        const p = this.particles[this.particleCursor++ % this.particles.length];
        p.position.copy(this.car.body.localToWorld(anchor.clone()));
        p.life = 0.38;
      }
    let visible = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life = Math.max(0, p.life - dt);
      visible ||= p.life > 0;
      this.particleDummy.position.copy(p.position);
      this.particleDummy.scale.setScalar(p.life / 0.38);
      this.particleDummy.updateMatrix();
      this.trail.setMatrixAt(i, this.particleDummy.matrix);
    }
    this.trail.instanceMatrix.needsUpdate = true;
    this.trail.visible = visible;
  }
  getStats() {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelRatio: this.pixelRatio,
      frameCost: this.frameCost,
      contextLost: this.lost,
    };
  }
  getCarPortraits() {
    return (this.portraits ??= renderCarPortraits(
      this.renderer,
      this.environment.texture,
    ));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.workshop?.cleanup();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onLost,
    );
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.onRestored,
    );
    disposeObject(this.scene);
    this.environment.dispose();
    this.bloom.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
