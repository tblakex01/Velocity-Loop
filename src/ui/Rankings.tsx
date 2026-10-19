import { useEffect, useState } from "react";
import { api, type Standing } from "../api";
import { CARS, COURSES, formatTime } from "../game/definitions";
import type { RaceConfig } from "../game/types";
import { Modal } from "./Modal";
export function Rankings({
  config,
  onClose,
}: {
  config: RaceConfig;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState(config),
    [entries, setEntries] = useState<Standing[]>([]),
    [status, setStatus] = useState("Loading verified standings…");
  useEffect(() => {
    const controller = new AbortController();
    setEntries([]);
    setStatus("Loading verified standings…");
    void api<{ entries: Standing[]; total: number }>(
      `/rankings?courseId=${filter.courseId}&carId=${filter.carId}&assist=${filter.assist}`,
      undefined,
      controller.signal,
    )
      .then((data) => {
        setEntries(data.entries);
        setStatus(
          data.entries.length
            ? `${data.total} verified drivers`
            : "No verified records yet. Finish a race and set the first one.",
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setStatus(e.message);
      });
    return () => controller.abort();
  }, [filter.courseId, filter.carId, filter.assist]);
  return (
    <Modal
      title="WORKSHOP STANDINGS"
      subtitle="SERVER-VERIFIED COMPETITION"
      onClose={onClose}
    >
      <div className="ranking-filters">
        <label>
          Course
          <select
            value={filter.courseId}
            onChange={(e) =>
              setFilter({
                ...filter,
                courseId: e.target.value as RaceConfig["courseId"],
              })
            }
          >
            {COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Car
          <select
            value={filter.carId}
            onChange={(e) =>
              setFilter({
                ...filter,
                carId: e.target.value as RaceConfig["carId"],
              })
            }
          >
            {CARS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assist
          <select
            value={filter.assist}
            onChange={(e) =>
              setFilter({
                ...filter,
                assist: e.target.value as RaceConfig["assist"],
              })
            }
          >
            <option value="full">Full</option>
            <option value="balanced">Balanced</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>
      <p className="ranking-status" role="status">
        {status}
      </p>
      {entries.length > 0 && (
        <table className="rankings-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>DRIVER</th>
              <th>TIME</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={`${entry.rank}:${entry.username}`}>
                <td>{String(entry.rank).padStart(2, "0")}</td>
                <td>{entry.username}</td>
                <td>{formatTime(entry.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="fine-print">
        Every ranked time is reproduced from recorded inputs on the server. Cars
        and assists compete in separate categories.
      </p>
    </Modal>
  );
}
