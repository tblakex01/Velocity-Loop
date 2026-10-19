import type { RaceInput } from "./game/types";

export class DrivingInput {
  private keys = new Set<string>();
  private touches = new Map<number, string>();
  enabled = false;
  autoThrottle = false;
  onAction: (action: string) => void = () => {};
  private down = (event: KeyboardEvent) => {
    if (
      !this.enabled ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input,textarea,select"))
    )
      return;
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        event.code,
      )
    )
      event.preventDefault();
    this.keys.add(event.code);
    if (!event.repeat) {
      if (event.code === "Escape" || event.code === "KeyP")
        this.onAction("pause");
      if (event.code === "KeyC") this.onAction("camera");
      if (event.code === "KeyR") this.onAction("retry");
    }
  };
  private up = (event: KeyboardEvent) => this.keys.delete(event.code);
  private blur = () => this.clear();
  private previousButtons = new Set<number>();
  constructor() {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
  }
  touch(pointerId: number, action: string) {
    this.touches.set(pointerId, action);
  }
  release(pointerId: number) {
    this.touches.delete(pointerId);
  }
  clear() {
    this.keys.clear();
    this.touches.clear();
    this.previousButtons.clear();
  }
  read(): RaceInput {
    if (!this.enabled) return { throttle: 0, brake: 0, steer: 0, nitro: false };
    const held = (key: string, arrow: string, action: string) =>
      this.keys.has(key) ||
      this.keys.has(arrow) ||
      [...this.touches.values()].includes(action);
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    const axis = pad?.axes[0] ?? 0;
    const steer =
      Math.abs(axis) > 0.14
        ? (Math.sign(axis) * (Math.abs(axis) - 0.14)) / 0.86
        : 0;
    const buttons = new Set<number>();
    pad?.buttons.forEach((b, i) => {
      if (b.pressed) buttons.add(i);
    });
    for (const [button, action] of [
      [9, "pause"],
      [3, "camera"],
      [2, "retry"],
    ] as const) {
      if (buttons.has(button) && !this.previousButtons.has(button))
        this.onAction(action);
    }
    this.previousButtons = buttons;
    return {
      throttle: Math.max(
        held("KeyW", "ArrowUp", "throttle") || this.autoThrottle ? 1 : 0,
        pad?.buttons[7]?.value ?? 0,
      ),
      brake: Math.max(
        held("KeyS", "ArrowDown", "brake") ? 1 : 0,
        pad?.buttons[6]?.value ?? 0,
      ),
      steer: Math.max(
        -1,
        Math.min(
          1,
          steer +
            (held("KeyD", "ArrowRight", "right") ? 1 : 0) -
            (held("KeyA", "ArrowLeft", "left") ? 1 : 0),
        ),
      ),
      nitro: held("Space", "ShiftLeft", "nitro") || buttons.has(0),
    };
  }
  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
  }
}
