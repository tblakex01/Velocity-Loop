import { formatTime, getCourse } from "../game/definitions";
import type { RaceState, Replay } from "../game/types";
import { Icon } from "./Icons";
export type FinishResult = {
  replay: Replay;
  state: RaceState;
  medal: string;
  newBest: boolean;
  previousBest: number | null;
  xp: number;
  ghostWon: boolean;
};
export function Results({
  result,
  series,
  submitStatus,
  busy,
  onSubmit,
  onRetry,
  onNext,
  onRestartSeries,
  onHome,
  onRankings,
  username,
}: {
  result: FinishResult;
  series: { index: number; total: number; time: number } | null;
  submitStatus: string;
  busy: boolean;
  onSubmit: () => void;
  onRetry: () => void;
  onNext: (() => void) | null;
  onRestartSeries: () => void;
  onHome: () => void;
  onRankings: () => void;
  username?: string;
}) {
  const course = getCourse(result.replay.config.courseId),
    skills = result.state.skills;
  return (
    <div className="results-screen">
      <section className="results-card">
        <span className="eyebrow">
          {series
            ? `RACE ${series.index + 1} OF ${series.total} · SERIES TIME ${formatTime(series.time)}`
            : `${course.name} · RACE COMPLETE`}
        </span>
        <div className={`medal-badge ${result.medal.toLowerCase()}`}>
          <Icon name="trophy" size={34} />
        </div>
        <h1>{result.newBest ? "A NEW BENCHMARK." : "THAT’S A WRAP."}</h1>
        <div className="finish-clock">
          {formatTime(result.replay.finishTime)}
        </div>
        <div className="finish-awards">
          <span>{result.medal.toUpperCase()} MEDAL</span>
          {result.newBest && <span className="orange-text">PERSONAL BEST</span>}
          <span>+{result.xp} DRIVER XP</span>
        </div>
        {result.previousBest !== null && (
          <p className="finish-delta">
            {result.newBest
              ? `${(result.previousBest - result.replay.finishTime).toFixed(3)}s faster than your best`
              : `Best ${formatTime(result.previousBest)} · +${(result.replay.finishTime - result.previousBest).toFixed(3)}s`}
            {result.ghostWon ? " · Ghost beaten" : ""}
          </p>
        )}
        <div className="skill-rewards">
          <span>
            CONTROLLED DRIFT<b>{skills.drift.toFixed(1)}s</b>
          </span>
          <span>
            CLEAN DRIVING<b>{skills.clean.toFixed(1)}s</b>
          </span>
          <span>
            TIMED BOOSTS<b>{skills.boosts}</b>
          </span>
          <span>
            CLEAN RECOVERY<b>{skills.recovery}</b>
          </span>
        </div>
        <p className="medal-targets">
          Targets · Gold {formatTime(course.medals[0])} · Silver{" "}
          {formatTime(course.medals[1])} · Bronze {formatTime(course.medals[2])}
        </p>
        <div className="result-buttons">
          <button
            className="primary-button"
            onClick={onNext ?? (series ? onRestartSeries : onRetry)}
          >
            {onNext
              ? "NEXT RACE"
              : series
                ? series.total === 5
                  ? "NEW GRAND TOUR"
                  : "NEW WORKSHOP SERIES"
                : "RACE AGAIN"}
            <Icon name="arrow" />
          </button>
          {series && <button onClick={onRetry}>Retry this race</button>}
          <button onClick={onHome}>Workshop & garage</button>
        </div>
        <div className="result-competition">
          <button disabled={busy} onClick={onSubmit}>
            {busy
              ? "Verifying replay…"
              : username
                ? "Submit verified run"
                : "Sign in to submit"}
          </button>
          <button onClick={onRankings}>View standings</button>
        </div>
        {submitStatus && (
          <p className="submission-status" role="status">
            {submitStatus}
          </p>
        )}
      </section>
    </div>
  );
}
