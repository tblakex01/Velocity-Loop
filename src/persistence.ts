import type { LocalRecord, RaceConfig, Replay } from "./game/types";
import { getCourse, medalFor, validateConfig } from "./game/definitions";
import { validateReplay, verifyReplay } from "./game/replay";
export const MAX_RECORD_FILE_BYTES = 64 * 1024 * 1024;

export const recordKey = (c: RaceConfig) =>
  `${c.courseId}:${c.carId}:${c.assist}:${c.laps}:r${c.revision ?? 1}`;
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("velocity-loop", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("records");
      request.result.createObjectStore("legacy");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function readRecords(): Promise<LocalRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("records").objectStore("records").getAll();
    request.onsuccess = () => {
      const unique = new Map<string, LocalRecord>();
      for (const record of request.result as LocalRecord[]) {
        const key = recordKey(record.config),
          previous = unique.get(key);
        if (!previous || record.time < previous.time) unique.set(key, record);
      }
      resolve([...unique.values()]);
    };
    request.onerror = () => reject(request.error);
  });
}
export async function saveRecord(record: LocalRecord): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["records", "legacy"], "readwrite"),
      store = tx.objectStore("records"),
      key = recordKey(record.config);
    let saved = false;
    const request = store.get(key);
    request.onsuccess = () => {
      const previous = request.result as LocalRecord | undefined;
      if (
        !previous ||
        (Boolean(record.replay) && !previous.replay) ||
        (Boolean(record.replay) === Boolean(previous.replay) &&
          record.time < previous.time)
      ) {
        if (previous && !previous.replay)
          tx.objectStore("legacy").put(previous, `preserved:${key}`);
        store.put(record, key);
        saved = true;
      } else if (!record.replay) {
        tx.objectStore("legacy").put(record, `imported:${key}`);
      }
    };
    tx.oncomplete = () => resolve(saved);
    tx.onerror = () => reject(tx.error);
  });
}
export function parseImportedRecord(value: unknown): LocalRecord {
  if (!value || typeof value !== "object")
    throw new Error("Invalid record file.");
  const r = value as Partial<LocalRecord>;
  if (
    !r.config ||
    !Number.isFinite(r.time) ||
    (r.time ?? 0) <= 0 ||
    (r.time ?? 0) > 300
  )
    throw new Error("A record has an invalid time or configuration.");
  validateConfig(r.config);
  const course = getCourse(r.config.courseId, r.config.revision ?? 1);
  let replay: Replay | null = null;
  if (r.replay && r.replay.version === 1) {
    replay = validateReplay(r.replay);
    const verified = verifyReplay(replay);
    if (!verified.valid)
      throw new Error(verified.reason ?? "Imported replay could not finish.");
    if (
      recordKey(replay.config) !== recordKey(r.config) ||
      Math.abs(replay.finishTime - r.time!) > 0.01
    )
      throw new Error("Record and replay disagree.");
  }
  return {
    config: r.config,
    time: r.time!,
    medal: medalFor(course, r.time!),
    replay,
    eligible: false,
    ...(r.replay && !replay
      ? { archivedReplay: r.replay }
      : r.archivedReplay
        ? { archivedReplay: r.archivedReplay }
        : {}),
  };
}
export async function importRecords(text: string): Promise<number> {
  if (
    text.length > MAX_RECORD_FILE_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_RECORD_FILE_BYTES
  )
    throw new Error("Record file must be smaller than 64 MB.");
  const payload = JSON.parse(text) as { records?: unknown[]; version?: number };
  if (!Array.isArray(payload.records) || payload.records.length > 120)
    throw new Error("Expected up to 120 current and older records.");
  const records = payload.records.map(parseImportedRecord);
  let count = 0;
  for (const record of records) if (await saveRecord(record)) count++;
  return count;
}
export async function archiveLegacy() {
  const text = localStorage.getItem("velocity-loop-records");
  if (!text) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("legacy", "readwrite");
    tx.objectStore("legacy").put(text, "original-v0");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  try {
    await importRecords(text);
  } catch {
    /* Original remains in both stores for future migration. */
  }
}
export type Progress = {
  version: 1;
  xp: number;
  races: number;
  tours: number;
  series: number;
};
export function readProgress(): Progress {
  try {
    const p = JSON.parse(
      localStorage.getItem("velocity-loop-progress") ?? "{}",
    );
    if (
      p.version === 1 &&
      ["xp", "races", "tours", "series"].every(
        (k) => Number.isSafeInteger(p[k]) && p[k] >= 0,
      )
    )
      return p;
  } catch {
    /* Use defaults for invalid settings. */
  }
  return { version: 1, xp: 0, races: 0, tours: 0, series: 0 };
}
export function saveProgress(progress: Progress) {
  localStorage.setItem("velocity-loop-progress", JSON.stringify(progress));
}
