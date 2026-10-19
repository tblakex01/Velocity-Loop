import { DT, createRace, stepRace } from "./game/simulation";
import { CURRENT_REVISION, getCourse } from "./game/definitions";
import { replayFrames } from "./game/replay";
import { buildGhostTimeline, ghostGap, type GhostTimeline } from "./game/ghost";
import type {
  GhostFrame,
  RaceConfig,
  RaceInput,
  RaceState,
  Replay,
} from "./game/types";
import { DrivingInput } from "./input";
import { RaceAudio } from "./audio";
import { GameRenderer } from "./render/GameRenderer";

export type Phase = "menu" | "countdown" | "racing" | "paused" | "finished";
export type CameraMode = "chase" | "hood" | "orbit";
export type Quality = "auto" | "high" | "low";
export type Snapshot = {
  phase: Phase;
  state: RaceState | null;
  countdown: number;
  camera: CameraMode;
  status: string;
  ghostDelta: number | null;
};

export class GameRuntime {
  readonly input = new DrivingInput();
  readonly audio = new RaceAudio();
  private renderer: GameRenderer;
  private state: RaceState | null = null;
  private config: RaceConfig;
  private phase: Phase = "menu";
  private resumePhase: Phase = "racing";
  private accumulator = 0;
  private countdown = 3;
  private recording: RaceInput[] = [];
  private ghosts: GhostFrame[] = [];
  private ghostTimeline: GhostTimeline | null = null;
  private raf = 0;
  private last = 0;
  private lastPublish = 0;
  private status = "Preparing the workshop…";
  private camera: CameraMode = "chase";
  onSnapshot: (value: Snapshot) => void = () => {};
  onFinish: (replay: Replay, state: RaceState) => void = () => {};
  onRetry: () => void = () => this.start(this.config, this.activeGhost);
  private activeGhost: Replay | null = null;
  constructor(container: HTMLElement, config: RaceConfig) {
    this.config = config;
    this.renderer = new GameRenderer(container, (status) => {
      this.status = status;
      if (
        /lost|graphics paused/i.test(status) &&
        (this.phase === "racing" || this.phase === "countdown")
      )
        this.pause();
      this.publish();
    });
    this.renderer.setCourse(config.courseId);
    this.renderer.setCar(config.carId);
    this.input.onAction = (action) => {
      if (action === "pause") this.pause();
      if (action === "camera") this.cycleCamera();
      if (action === "retry") this.onRetry();
    };
    document.addEventListener("visibilitychange", this.visibility);
    this.raf = requestAnimationFrame(this.frame);
  }
  private visibility = () => {
    if (document.hidden) {
      this.input.clear();
      if (this.phase === "racing" || this.phase === "countdown") this.pause();
    }
  };
  private frame = (time: number) => {
    const dt = this.last ? Math.min((time - this.last) / 1000, 0.1) : 0;
    this.last = time;
    if (this.phase === "paused" || this.phase === "countdown")
      this.input.read();
    if (this.phase === "countdown") {
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - dt);
      if (Math.ceil(this.countdown) !== before)
        this.audio.chime(this.countdown ? 660 : 990);
      if (this.countdown === 0) {
        this.phase = "racing";
        this.accumulator = 0;
      }
    }
    if (this.phase === "racing" && this.state) {
      this.accumulator += dt;
      while (this.accumulator >= DT && !this.state.finished) {
        const beforeInput: RaceState = this.state;
        const input = this.input.read();
        if (this.phase !== "racing" || this.state !== beforeInput) break;
        this.recording.push({ ...input });
        stepRace(this.state, input, this.config);
        this.accumulator -= DT;
        if (this.state.tick >= 36_000 && !this.state.finished) {
          this.phase = "paused";
          this.resumePhase = "racing";
          this.status =
            "Five-minute race limit reached. Retry to make a fresh run.";
          break;
        }
      }
      if (this.state.finished) {
        this.phase = "finished";
        this.input.enabled = false;
        this.audio.chime(1100);
        const replay: Replay = {
          version: 1,
          config: { ...this.config },
          inputs: this.recording,
          finishTime: this.state.finishTime!,
          createdAt: new Date().toISOString(),
        };
        this.onFinish(replay, structuredClone(this.state));
      }
    }
    const ghost = this.state
      ? this.ghosts[Math.min(this.state.tick, this.ghosts.length - 1)]
      : undefined;
    this.renderer.update(this.state, dt, ghost ?? null);
    this.audio.update(
      this.state?.speed ?? 0,
      this.state?.boosting ?? false,
      this.phase === "racing",
    );
    if (time - this.lastPublish > 80 || this.phase === "finished") {
      this.lastPublish = time;
      this.publish();
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  private publish() {
    this.onSnapshot({
      phase: this.phase,
      state: this.state
        ? { ...this.state, skills: { ...this.state.skills } }
        : null,
      countdown: Math.ceil(this.countdown),
      camera: this.camera,
      status: this.status,
      ghostDelta:
        this.state && this.ghostTimeline
          ? ghostGap(this.ghostTimeline, this.state.distance, this.state.time)
          : null,
    });
  }
  select(config: RaceConfig) {
    if (this.config.courseId !== config.courseId)
      this.renderer.setCourse(config.courseId);
    if (this.config.carId !== config.carId) this.renderer.setCar(config.carId);
    this.config = config;
  }
  start(config: RaceConfig, ghost?: Replay | null) {
    if ((config.revision ?? CURRENT_REVISION) !== CURRENT_REVISION)
      throw new Error(
        "Earlier track records are preserved in Settings. Start a race on the current courses.",
      );
    this.select(config);
    this.state = createRace(config);
    this.recording = [];
    this.ghosts = [];
    this.ghostTimeline = null;
    this.activeGhost = null;
    if (ghost) {
      try {
        if (
          (ghost.config.revision ?? 1) !==
            (config.revision ?? CURRENT_REVISION) ||
          ghost.config.courseId !== config.courseId ||
          ghost.config.carId !== config.carId ||
          ghost.config.assist !== config.assist ||
          ghost.config.laps !== config.laps
        )
          throw new Error(
            "Ghost belongs to a different course or race category.",
          );
        this.ghosts = replayFrames(ghost);
        this.ghostTimeline = buildGhostTimeline(this.ghosts);
        this.activeGhost = ghost;
      } catch {
        this.status =
          "An older ghost is preserved in records but cannot race in this version.";
      }
    }
    this.phase = "countdown";
    this.countdown = 3;
    this.accumulator = 0;
    this.input.clear();
    this.input.enabled = true;
    this.renderer.setMode("race");
    this.renderer.setCamera(this.camera);
    this.audio.unlock();
    this.audio.chime();
    this.publish();
  }
  pause() {
    if (this.phase === "paused") {
      if (this.state && this.state.tick >= 36_000) return;
      this.phase = this.resumePhase;
      this.input.enabled = true;
    } else if (this.phase === "racing" || this.phase === "countdown") {
      this.resumePhase = this.phase;
      this.phase = "paused";
      this.accumulator = 0;
      this.input.clear();
      this.input.enabled = true;
    }
    this.publish();
  }
  hasGhost() {
    return this.ghosts.length > 0;
  }
  getCarPortraits() {
    return this.renderer.getCarPortraits();
  }
  home() {
    this.phase = "menu";
    this.state = null;
    this.input.clear();
    this.input.enabled = false;
    this.renderer.setMode("menu");
    this.publish();
  }
  cycleCamera() {
    this.camera =
      this.camera === "chase"
        ? "hood"
        : this.camera === "hood"
          ? "orbit"
          : "chase";
    this.renderer.setCamera(this.camera);
    this.publish();
  }
  settings(sound: boolean, quality: Quality, autoThrottle: boolean) {
    this.audio.enabled = sound;
    this.input.autoThrottle = autoThrottle;
    this.renderer.setQuality(quality);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.visibility);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
export const configFor = (
  courseId: RaceConfig["courseId"],
  carId: RaceConfig["carId"],
  assist: RaceConfig["assist"],
): RaceConfig => ({
  courseId,
  carId,
  assist,
  laps: getCourse(courseId).laps,
  revision: CURRENT_REVISION,
});
