import {
  CURRENT_REVISION,
  formatTime,
  getCar,
  getCourse,
} from "../game/definitions";
import type { LocalRecord } from "../game/types";

export function OlderRecords({ records }: { records: LocalRecord[] }) {
  const older = records.filter(
    (record) => (record.config.revision ?? 1) !== CURRENT_REVISION,
  );
  if (!older.length) return null;
  return (
    <details className="older-records">
      <summary>Preserved records from earlier tracks ({older.length})</summary>
      <p>
        These earned times and original ghosts are preserved. The corrected
        courses have separate records so times stay comparable.
      </p>
      <table className="rankings-table">
        <thead>
          <tr>
            <th>COURSE / CAR</th>
            <th>ASSIST</th>
            <th>TIME</th>
          </tr>
        </thead>
        <tbody>
          {older.map((record) => (
            <tr
              key={`${record.config.courseId}:${record.config.carId}:${record.config.assist}:${record.config.revision ?? 1}`}
            >
              <td>
                {
                  getCourse(record.config.courseId, record.config.revision ?? 1)
                    .name
                }
                <br />
                <small>{getCar(record.config.carId).name}</small>
              </td>
              <td>{record.config.assist}</td>
              <td>{formatTime(record.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
