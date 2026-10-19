import type { Assist, CarId, CourseId, LocalRecord } from "../game/types";
import {
  ASSISTS,
  CARS,
  COURSES,
  formatTime,
  getCar,
  getCourse,
} from "../game/definitions";
import { recordKey } from "../persistence";
import { configFor } from "../runtime";
import { Icon } from "./Icons";
import { TrackMap } from "./TrackMap";

export type RaceMode = "trial" | "series" | "tour";
type Props = {
  courseId: CourseId;
  carId: CarId;
  assist: Assist;
  mode: RaceMode;
  records: LocalRecord[];
  portraits: Partial<Record<CarId, string>>;
  username?: string;
  xp: number;
  ready: boolean;
  onCourse: (id: CourseId) => void;
  onCar: (id: CarId) => void;
  onAssist: (id: Assist) => void;
  onMode: (mode: RaceMode) => void;
  onRace: () => void;
  onSettings: () => void;
  onRankings: () => void;
  onAccount: () => void;
};
function CourseChoice({
  courseId,
  carId,
  assist,
  records,
  onCourse,
}: Pick<Props, "courseId" | "carId" | "assist" | "records" | "onCourse">) {
  return (
    <div className="courses" role="group" aria-label="Choose a course">
      <div className="course-columns">
        <span>COURSE / DIFFICULTY</span>
        <span>PERSONAL BEST</span>
      </div>
      {COURSES.map((course, i) => {
        const record = records.find(
          (r) =>
            recordKey(r.config) ===
            recordKey(configFor(course.id, carId, assist)),
        );
        return (
          <button
            key={course.id}
            className={`course-row ${course.id === courseId ? "selected" : ""}`}
            onClick={() => onCourse(course.id)}
            aria-pressed={course.id === courseId}
          >
            <span className="course-number">0{i + 1}</span>
            <TrackMap courseId={course.id} />
            <span className="course-name">
              <strong>{course.name}</strong>
              <span>
                {
                  ["", "Easy", "Moderate", "Hard", "Expert", "Extreme"][
                    course.difficulty
                  ]
                }{" "}
                <i className="difficulty">
                  {"▰".repeat(course.difficulty)}
                  <em>{"▰".repeat(5 - course.difficulty)}</em>
                </i>
              </span>
            </span>
            <span className="course-time">
              {record ? formatTime(record.time) : "—"}
              <small>
                {record ? record.medal.toUpperCase() : "SET A RECORD"}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
function Garage({
  carId,
  onCar,
  portraits,
}: Pick<Props, "carId" | "onCar" | "portraits">) {
  return (
    <div className="garage" role="group" aria-label="Choose your car">
      {CARS.map((car, i) => (
        <button
          key={car.id}
          className={`car-option ${car.id === carId ? "selected" : ""}`}
          style={{ "--car-color": car.color } as React.CSSProperties}
          onClick={() => onCar(car.id)}
          aria-pressed={car.id === carId}
        >
          <span className="car-index">
            0{i + 1} <span className="paint-swatch" />
          </span>
          {portraits[car.id] && (
            <img
              className="car-portrait"
              src={portraits[car.id]}
              alt={`${car.name} die-cast model`}
              draggable={false}
            />
          )}
          <strong>{car.name}</strong>
          <small>{car.subtitle}</small>
        </button>
      ))}
    </div>
  );
}
function AssistChoice({
  assist,
  onAssist,
}: Pick<Props, "assist" | "onAssist">) {
  return (
    <div className="assist-options" role="group" aria-label="Driving assist">
      {ASSISTS.map((a) => (
        <button
          key={a.id}
          className={assist === a.id ? "selected" : ""}
          onClick={() => onAssist(a.id)}
          aria-pressed={assist === a.id}
        >
          <span className="radio-dot" />
          <span>
            <strong>{a.label}</strong>
            <small>{a.description}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
export function Menu(props: Props) {
  const car = getCar(props.carId),
    course = getCourse(props.courseId);
  const gripScore = Math.round(
    (car.grip / Math.max(...CARS.map((c) => c.grip))) * 100,
  );
  return (
    <div className="home">
      <header className="home-header">
        <a className="wordmark" href="#" aria-label="Velocity Loop home">
          VELOCITY
          <span>
            LOOP<i>®</i>
          </span>
        </a>
        <span className="header-caption">
          THE MINIATURE MOTORSPORT COLLECTION
        </span>
        <nav aria-label="Game navigation">
          <button onClick={props.onRankings} aria-label="Standings">
            <Icon name="trophy" />
            <span>Standings</span>
          </button>
          <button onClick={props.onSettings} aria-label="Settings">
            <Icon name="settings" />
          </button>
          <button className="account-button" onClick={props.onAccount}>
            {props.username ?? "Sign in"}
            <span className="online-dot" />
          </button>
        </nav>
      </header>
      <main className="menu-main">
        <section className="course-panel">
          <div className="eyebrow">
            <span className="orange-line" />
            BUILT FOR THE THRILL
          </div>
          <h1>
            SMALL CARS.
            <br />
            <span>BIG THRILLS.</span>
          </h1>
          <div className="mode-tabs" role="group" aria-label="Race mode">
            {(
              [
                ["trial", "Time Trial"],
                ["series", "Workshop Series"],
                ["tour", "Grand Tour"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={props.mode === id}
                onClick={() => props.onMode(id)}
                className={props.mode === id ? "active" : ""}
              >
                {label}
              </button>
            ))}
          </div>
          <CourseChoice {...props} />
          <p className="mode-note">
            {props.mode === "trial"
              ? "Find your line. Chase your ghost. Beat the clock."
              : props.mode === "series"
                ? "Three workshop races. One championship."
                : "All five courses. The ultimate workshop challenge."}
          </p>
        </section>
        <section className="showroom" aria-label="Live 3D car preview">
          <div className="collection-label">
            <span>01 / WORKSHOP EDITION</span>
            <span className="scale-label">DIE-CAST · 1:64</span>
          </div>
          <div className="showroom-caption">
            <span className="eyebrow">YOUR NEXT DRIVE</span>
            <h2>{car.name}</h2>
            <p>
              {car.subtitle} · {course.loops} loop
              {course.loops === 1 ? "" : "s"} · {course.laps} lap
              {course.laps === 1 ? "" : "s"}
            </p>
          </div>
          <Garage {...props} />
          <div className="car-specs">
            <span>
              TOP SPEED{" "}
              <strong>
                {Math.round(car.speed * 3.6)} <small>KM/H</small>
              </strong>
            </span>
            <span>
              GRIP{" "}
              <strong>
                {gripScore}
                <small>/ 100</small>
              </strong>
            </span>
            <span>
              NITRO{" "}
              <strong>
                {car.nitro.toFixed(1)}
                <small>× BOOST</small>
              </strong>
            </span>
            <span className="xp-level">
              DRIVER LEVEL{" "}
              <strong>
                {1 + Math.floor(props.xp / 1000)}
                <small>{props.xp.toLocaleString()} XP</small>
              </strong>
            </span>
          </div>
        </section>
      </main>
      <footer className="menu-footer">
        <div className="assist-label">
          <strong>DRIVING ASSIST</strong>
          <span>Records are saved per car & assist.</span>
        </div>
        <AssistChoice {...props} />
        <button
          className="race-button"
          onClick={props.onRace}
          disabled={!props.ready}
        >
          {props.ready ? "RACE" : "LOADING"}
          <Icon name="arrow" size={26} />
        </button>
      </footer>
      <div className="home-bottom">
        <span>HANDCRAFTED TRACKS. UNLIMITED POSSIBILITIES.</span>
        <span>
          <kbd>WASD</kbd> DRIVE <kbd>SPACE</kbd> NITRO <kbd>C</kbd> CAMERA
        </span>
      </div>
    </div>
  );
}
