import { formatTime, getCourse } from "../game/definitions";
import type { LocalRecord, RaceConfig, RaceState } from "../game/types";
import { Icon } from "./Icons";
export function RacingHeader({
  config,
  state,
  best,
  gap,
  onCamera,
  onPause,
}: {
  config: RaceConfig;
  state: RaceState;
  best?: LocalRecord;
  gap: number | null;
  onCamera: () => void;
  onPause: () => void;
}) {
  const course = getCourse(config.courseId);
  return (
    <>
      <header className="race-top">
        <span className="race-brand">
          VELOCITY <b>LOOP</b>
        </span>
        <span className="race-course-label">{course.name}</span>
        <div className="race-actions">
          <button aria-label="Switch camera" onClick={onCamera}>
            <Icon name="camera" />
          </button>
          <button aria-label="Pause race" onClick={onPause}>
            <Icon name="pause" />
          </button>
        </div>
      </header>
      <div className="race-lap-status">
        LAP {Math.min(state.lap, config.laps)} / {config.laps}
        <span>{config.assist.toUpperCase()} ASSIST</span>
      </div>
      <div className="race-clock">
        <strong>
          {formatTime(state.finishTime ?? state.time).padStart(9, "0")}
        </strong>
        {gap !== null ? (
          <span
            className={`ghost-time-gap ${gap < 0 ? "ahead" : gap > 0.01 ? "behind" : ""}`}
          >
            {gap > 0 ? "+" : ""}
            {gap.toFixed(3)}
            <small>PERSONAL BEST GHOST</small>
          </span>
        ) : (
          <span>
            PERSONAL BEST <b>{best ? formatTime(best.time) : "SET A TIME"}</b>
          </span>
        )}
      </div>
    </>
  );
}
