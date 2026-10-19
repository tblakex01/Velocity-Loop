import { useEffect, useRef, useState } from "react";
import type {
  Assist,
  CarId,
  CourseId,
  LocalRecord,
  RaceConfig,
  RaceState,
  Replay,
} from "./game/types";
import { CARS, COURSES, medalFor } from "./game/definitions";
import { api, ApiError, type User } from "./api";
import {
  archiveLegacy,
  readProgress,
  readRecords,
  recordKey,
  saveProgress,
  saveRecord,
  type Progress,
} from "./persistence";
import { configFor, GameRuntime, type Snapshot } from "./runtime";
import { Menu, type RaceMode } from "./ui/Menu";
import { RaceHUD } from "./ui/RaceHUD";
import { Results, type FinishResult } from "./ui/Results";
import { Account } from "./ui/Account";
import { Rankings } from "./ui/Rankings";
import { Settings, type SettingsValue } from "./ui/Settings";

const defaultSettings: SettingsValue = {
  sound: true,
  quality: "auto",
  autoThrottle: false,
  ghost: true,
};
function loadSettings(): SettingsValue {
  try {
    const s = JSON.parse(
      localStorage.getItem("velocity-loop-settings") ?? "{}",
    );
    return {
      sound: typeof s.sound === "boolean" ? s.sound : true,
      quality: ["auto", "high", "low"].includes(s.quality) ? s.quality : "auto",
      autoThrottle: s.autoThrottle === true,
      ghost: s.ghost !== false,
    };
  } catch {
    return defaultSettings;
  }
}
type Series = {
  courses: CourseId[];
  index: number;
  time: number;
  mode: RaceMode;
  awarded: boolean;
};
export function App() {
  const container = useRef<HTMLDivElement>(null),
    runtime = useRef<GameRuntime | null>(null);
  const [courseId, setCourse] = useState<CourseId>("double"),
    [carId, setCar] = useState<CarId>("atelier"),
    [assist, setAssist] = useState<Assist>("full"),
    [mode, setMode] = useState<RaceMode>("trial");
  const [snapshot, setSnapshot] = useState<Snapshot>({
      phase: "menu",
      state: null,
      countdown: 3,
      camera: "chase",
      status: "Preparing the workshop…",
      ghostDelta: null,
    }),
    [ready, setReady] = useState(false),
    [fatal, setFatal] = useState("");
  const [settings, setSettings] = useState(loadSettings),
    [portraits, setPortraits] = useState<Partial<Record<CarId, string>>>({}),
    [records, setRecords] = useState<LocalRecord[]>([]),
    [progress, setProgress] = useState<Progress>(readProgress),
    [user, setUser] = useState<User | null>(null);
  const [modal, setModal] = useState<
      "account" | "settings" | "rankings" | null
    >(null),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<FinishResult | null>(null),
    [series, setSeries] = useState<Series | null>(null),
    [submitStatus, setSubmitStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const config = configFor(courseId, carId, assist),
    latest = useRef({ records, progress, series, settings });
  latest.current = { records, progress, series, settings };
  const raceConfig = useRef<RaceConfig>(config);
  const retryRef = useRef<() => void>(() => {});
  const refreshRecords = () => {
    void readRecords()
      .then(setRecords)
      .catch(() =>
        setNotice(
          "Device storage is unavailable. This session can still race.",
        ),
      );
  };
  const finishRef = useRef<(replay: Replay, state: RaceState) => void>(
    () => {},
  );
  finishRef.current = (replay, state) => {
    const previous = latest.current.records.find(
        (r) => recordKey(r.config) === recordKey(replay.config),
      ),
      course = COURSES.find((c) => c.id === replay.config.courseId)!;
    const medal = medalFor(course, replay.finishTime),
      newBest =
        !previous || !previous.replay || replay.finishTime < previous.time;
    const ghostWon = Boolean(
      previous?.replay &&
      runtime.current?.hasGhost() &&
      replay.finishTime < previous.time,
    );
    const medalXp =
      (
        { gold: 250, silver: 150, bronze: 75, finish: 25 } as Record<
          string,
          number
        >
      )[medal.toLowerCase()] ?? 25;
    const xp = Math.round(
      100 +
        state.skills.clean * 2 +
        state.skills.drift * 12 +
        state.skills.boosts * 15 +
        state.skills.braking * 8 +
        state.skills.recovery * 20 +
        (ghostWon ? 100 : 0) +
        medalXp,
    );
    const finishedSeries = latest.current.series,
      seriesComplete =
        finishedSeries &&
        !finishedSeries.awarded &&
        finishedSeries.index === finishedSeries.courses.length - 1;
    const nextProgress = {
      ...latest.current.progress,
      xp: latest.current.progress.xp + xp,
      races: latest.current.progress.races + 1,
      tours:
        latest.current.progress.tours +
        (seriesComplete && finishedSeries.mode === "tour" ? 1 : 0),
      series:
        latest.current.progress.series +
        (seriesComplete && finishedSeries.mode === "series" ? 1 : 0),
    };
    setProgress(nextProgress);
    try {
      saveProgress(nextProgress);
    } catch {
      setNotice(
        "Progress is available for this session; device storage is full.",
      );
    }
    if (finishedSeries)
      setSeries({
        ...finishedSeries,
        time: finishedSeries.time + replay.finishTime,
        awarded: finishedSeries.awarded || Boolean(seriesComplete),
      });
    const local: LocalRecord = {
      config: replay.config,
      time: replay.finishTime,
      medal,
      replay,
      eligible: true,
    };
    if (newBest) {
      setRecords((prev) => [
        ...prev.filter((r) => recordKey(r.config) !== recordKey(local.config)),
        local,
      ]);
      void saveRecord(local).catch(() =>
        setNotice(
          "Record earned. Export it from Settings before leaving: device storage is unavailable.",
        ),
      );
    }
    setResult({
      replay,
      state,
      medal,
      newBest,
      previousBest: previous?.time ?? null,
      xp,
      ghostWon,
    });
    setSubmitStatus("");
  };
  useEffect(() => {
    if (!container.current) return;
    let game: GameRuntime | undefined;
    try {
      game = new GameRuntime(
        container.current,
        configFor("double", "atelier", "full"),
      );
      game.onSnapshot = setSnapshot;
      game.onFinish = (replay, state) => finishRef.current(replay, state);
      game.onRetry = () => retryRef.current();
      runtime.current = game;
      setPortraits(game.getCarPortraits());
      setReady(true);
    } catch (e) {
      setFatal(
        `The 3D workshop could not start: ${(e as Error).message}. Enable WebGL and reload.`,
      );
    }
    const abort = new AbortController();
    void api<{ user: User | null }>("/session", undefined, abort.signal)
      .then((data) => setUser(data.user))
      .catch(() => {});
    void archiveLegacy()
      .then(() => readRecords())
      .then(setRecords)
      .catch(() =>
        setNotice(
          "Device storage is unavailable. Records will last for this session.",
        ),
      );
    return () => {
      abort.abort();
      game?.dispose();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    if (snapshot.phase === "menu") runtime.current?.select(config);
  }, [courseId, carId, assist, snapshot.phase]);
  useEffect(() => {
    runtime.current?.settings(
      settings.sound,
      settings.quality,
      settings.autoThrottle,
    );
    try {
      localStorage.setItem("velocity-loop-settings", JSON.stringify(settings));
    } catch {
      /* Settings work for this session. */
    }
  }, [settings, ready]);
  const start = (nextConfig: RaceConfig = config) => {
    raceConfig.current = nextConfig;
    setResult(null);
    setNotice("");
    setSubmitStatus("");
    const best = latest.current.records.find(
      (r) => recordKey(r.config) === recordKey(nextConfig),
    );
    runtime.current?.start(nextConfig, settings.ghost ? best?.replay : null);
  };
  const startMode = () => {
    if (mode === "trial") {
      setSeries(null);
      start();
    } else {
      const courses =
        mode === "series"
          ? COURSES.slice(0, 3).map((c) => c.id)
          : COURSES.map((c) => c.id);
      setSeries({ courses, index: 0, time: 0, mode, awarded: false });
      setCourse(courses[0]);
      start(configFor(courses[0], carId, assist));
    }
  };
  const retry = () => {
    if (series && result)
      setSeries({ ...series, time: series.time - result.replay.finishTime });
    start(raceConfig.current);
  };
  retryRef.current = retry;
  const home = () => {
    runtime.current?.home();
    setResult(null);
    setSeries(null);
    setMode("trial");
  };
  const next = () => {
    if (!series) return;
    const index = series.index + 1,
      id = series.courses[index];
    setSeries({ ...series, index });
    setCourse(id);
    start(configFor(id, carId, assist));
  };
  const submit = async () => {
    if (!result) return;
    if (!user) {
      setModal("account");
      return;
    }
    setBusy(true);
    setSubmitStatus("Replaying your recorded inputs on the server…");
    try {
      const data = await api<{ verified: boolean; time: number; rank: number }>(
        "/runs",
        { replay: result.replay },
      );
      setSubmitStatus(
        `Verified. You’re ranked #${data.rank} in this car and assist category.`,
      );
    } catch (e) {
      setSubmitStatus((e as Error).message);
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setModal("account");
      }
    } finally {
      setBusy(false);
    }
  };
  const best = records.find(
    (r) => recordKey(r.config) === recordKey(raceConfig.current),
  );
  return (
    <div className={`app phase-${snapshot.phase}`}>
      <div
        className="scene"
        ref={container}
        aria-label="3D miniature racing workshop"
      />
      {snapshot.phase === "menu" && (
        <Menu
          courseId={courseId}
          carId={carId}
          assist={assist}
          mode={mode}
          records={records}
          portraits={portraits}
          username={user?.username}
          xp={progress.xp}
          ready={ready && !fatal}
          onCourse={(id) => {
            setCourse(id);
            setMode("trial");
          }}
          onCar={setCar}
          onAssist={setAssist}
          onMode={(value) => {
            setMode(value);
            if (value !== "trial") setCourse("ignition");
          }}
          onRace={startMode}
          onSettings={() => setModal("settings")}
          onRankings={() => setModal("rankings")}
          onAccount={() => setModal("account")}
        />
      )}
      {snapshot.phase !== "menu" &&
        snapshot.phase !== "finished" &&
        runtime.current && (
          <RaceHUD
            snapshot={snapshot}
            config={raceConfig.current}
            best={best}
            runtime={runtime.current}
            onHome={home}
            onRetry={retry}
          />
        )}
      {result && snapshot.phase === "finished" && (
        <Results
          result={result}
          series={
            series
              ? {
                  index: series.index,
                  total: series.courses.length,
                  time: series.time,
                }
              : null
          }
          busy={busy}
          submitStatus={submitStatus}
          username={user?.username}
          onSubmit={submit}
          onRetry={retry}
          onRestartSeries={startMode}
          onNext={
            series && series.index < series.courses.length - 1 ? next : null
          }
          onHome={home}
          onRankings={() => setModal("rankings")}
        />
      )}
      {modal === "account" && (
        <Account user={user} onUser={setUser} onClose={() => setModal(null)} />
      )}
      {modal === "settings" && (
        <Settings
          value={settings}
          onChange={setSettings}
          records={records}
          onImport={refreshRecords}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "rankings" && (
        <Rankings
          config={snapshot.phase === "menu" ? config : raceConfig.current}
          onClose={() => setModal(null)}
        />
      )}
      {fatal && (
        <div className="fatal-error" role="alert">
          {fatal}
          <button onClick={() => location.reload()}>Reload workshop</button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss notice">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
