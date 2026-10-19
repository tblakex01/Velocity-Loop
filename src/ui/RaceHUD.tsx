import type { LocalRecord, RaceConfig, RaceState } from "../game/types";
import type { GameRuntime, Snapshot } from "../runtime";
import { Icon } from "./Icons";
import { NitroGauge } from "./NitroGauge";
import { RacingHeader } from "./RacingHeader";
type Props = {
  snapshot: Snapshot;
  config: RaceConfig;
  best?: LocalRecord;
  runtime: GameRuntime;
  onHome: () => void;
  onRetry: () => void;
};
function TouchButton({
  runtime,
  action,
  label,
  children,
}: {
  runtime: GameRuntime;
  action: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`touch-button touch-${action}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        runtime.input.touch(e.pointerId, action);
      }}
      onPointerUp={(e) => runtime.input.release(e.pointerId)}
      onPointerCancel={(e) => runtime.input.release(e.pointerId)}
      onLostPointerCapture={(e) => runtime.input.release(e.pointerId)}
    >
      {children}
    </button>
  );
}
function TouchControls({ runtime }: { runtime: GameRuntime }) {
  return (
    <div className="touch-controls">
      <div className="touch-steer">
        <TouchButton runtime={runtime} action="left" label="Steer left">
          ←
        </TouchButton>
        <TouchButton runtime={runtime} action="right" label="Steer right">
          →
        </TouchButton>
      </div>
      <div className="touch-pedals">
        <TouchButton runtime={runtime} action="brake" label="Brake">
          BRAKE
        </TouchButton>
        <TouchButton runtime={runtime} action="throttle" label="Accelerate">
          GO
        </TouchButton>
        <TouchButton runtime={runtime} action="nitro" label="Nitrous boost">
          <Icon name="bolt" />
        </TouchButton>
      </div>
    </div>
  );
}
function RaceMeters({ state }: { state: RaceState }) {
  return (
    <div className="race-meters">
      <div className="speed">
        <strong>{Math.round(state.speed * 3.6)}</strong>
        <span>KM/H</span>
      </div>
      <div className="nitro-energy-line" aria-hidden="true">
        <i />
      </div>
      <NitroGauge value={state.nitro} boosting={state.boosting} />
    </div>
  );
}
export function RaceHUD({
  snapshot,
  config,
  best,
  runtime,
  onHome,
  onRetry,
}: Props) {
  const state = snapshot.state;
  if (!state) return null;
  return (
    <div className="race-hud">
      <RacingHeader
        config={config}
        state={state}
        best={best}
        gap={snapshot.ghostDelta}
        onCamera={() => runtime.cycleCamera()}
        onPause={() => runtime.pause()}
      />
      {snapshot.phase === "countdown" && (
        <div className="countdown" aria-live="polite">
          <strong>{snapshot.countdown || "GO"}</strong>
          <span>W / ↑ TO ACCELERATE</span>
        </div>
      )}
      {state.eventTicks > 0 && snapshot.phase === "racing" && (
        <div className="skill-event" role="status">
          {state.event}
        </div>
      )}
      {snapshot.phase === "paused" && (
        <div className="pause-screen">
          <div className="pause-card">
            <span className="eyebrow">TAKE A BREATHER</span>
            <h2>RACE PAUSED</h2>
            <p>
              {/limit|lost|recover/i.test(snapshot.status)
                ? snapshot.status
                : "Your race clock is stopped."}
            </p>
            <button className="primary-button" onClick={() => runtime.pause()}>
              Resume race
            </button>
            <button onClick={onRetry}>Retry from the start</button>
            <button onClick={onHome}>Back to workshop</button>
          </div>
        </div>
      )}
      <div className="race-bottom">
        <div className="race-hint">
          <kbd>WASD</kbd> DRIVE <kbd>SPACE</kbd> NITRO <kbd>C</kbd>{" "}
          {snapshot.camera.toUpperCase()} <kbd>ESC</kbd> PAUSE
        </div>
        <RaceMeters state={state} />
      </div>
      {snapshot.phase !== "paused" && <TouchControls runtime={runtime} />}
    </div>
  );
}
