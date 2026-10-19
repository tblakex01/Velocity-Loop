import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { Storage, type User } from "../server/storage";
import { CURRENT_REVISION, getCourse } from "../src/game/definitions";
import { createRace, stepRace } from "../src/game/simulation";
import { verifyReplay } from "../src/game/replay";
import type { RaceConfig, RaceInput, Replay } from "../src/game/types";

function verifiedRecording(revision: 1 | 2 = CURRENT_REVISION): {
  replay: Replay;
  time: number;
  compressed: Buffer;
} {
  const config: RaceConfig = {
    courseId: "ignition",
    carId: "atelier",
    assist: "full",
    laps: getCourse("ignition", revision).laps,
    revision,
  };
  const state = createRace(config);
  const inputs: RaceInput[] = [];
  while (!state.finished && state.tick < 36_000) {
    const input = { throttle: 1, brake: 0, steer: 0, nitro: true };
    inputs.push(input);
    stepRace(state, input, config);
  }
  expect(state.finished).toBe(true);
  const replay: Replay = {
    version: 1,
    config,
    inputs,
    finishTime: state.finishTime!,
    createdAt: new Date().toISOString(),
  };
  const verification = verifyReplay(replay);
  expect(verification.valid).toBe(true);
  return {
    replay,
    time: verification.time,
    compressed: gzipSync(JSON.stringify(replay)),
  };
}

describe("rankings at registered-player scale", () => {
  it("migrates schema 1 without changing earned records, replay bytes or sessions", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "velocity-storage-migration-"),
    );
    const path = join(directory, "rankings.sqlite");
    const legacy = verifiedRecording(1),
      current = verifiedRecording();
    const user = { id: "existing-driver", username: "ExistingDriver" };
    const createdAt = "2026-10-08T12:00:00.000Z";
    const { revision: _revision, ...legacyConfig } = legacy.replay.config;
    const originalBytes = gzipSync(
      JSON.stringify({ ...legacy.replay, config: legacyConfig }),
    );
    const original = new DatabaseSync(path);
    original.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE records(user_id TEXT NOT NULL REFERENCES users(id),course_id TEXT NOT NULL,car_id TEXT NOT NULL,assist TEXT NOT NULL,laps INTEGER NOT NULL,time REAL NOT NULL,created_at TEXT NOT NULL,replay BLOB NOT NULL,PRIMARY KEY(user_id,course_id,car_id,assist,laps));
      PRAGMA user_version=1;`);
    original
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(
        user.id,
        user.username,
        "existing-password-hash",
        "existing-recovery-hash",
        Date.now(),
      );
    original
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run("existing-session", user.id, Date.now() + 60000, Date.now());
    original
      .prepare("INSERT INTO records VALUES(?,?,?,?,?,?,?,?)")
      .run(
        user.id,
        legacyConfig.courseId,
        legacyConfig.carId,
        legacyConfig.assist,
        legacyConfig.laps,
        legacy.time,
        createdAt,
        originalBytes,
      );
    original.close();
    let storage: Storage | undefined;
    try {
      storage = new Storage(path);
      expect(storage.session("existing-session")).toEqual(user);
      expect(storage.account(user.username)).toMatchObject({
        password_hash: "existing-password-hash",
        recovery_hash: "existing-recovery-hash",
      });
      expect(storage.rankings(legacy.replay.config)).toEqual({
        entries: [
          {
            rank: 1,
            username: user.username,
            time: legacy.time,
            carId: legacyConfig.carId,
            createdAt,
            revision: 1,
          },
        ],
        total: 1,
      });
      expect(storage.rankings(current.replay.config)).toEqual({
        entries: [],
        total: 0,
      });
      storage.record(user, current.replay, current.time, current.compressed);
      expect(storage.rankings(current.replay.config).total).toBe(1);
      expect(storage.rankings(legacy.replay.config).entries[0]).toMatchObject({
        revision: 1,
        time: legacy.time,
        createdAt,
      });
      const inspection = new DatabaseSync(path);
      try {
        expect(
          inspection.prepare("PRAGMA user_version").get()?.user_version,
        ).toBe(2);
        expect(
          inspection.prepare("SELECT COUNT(*) AS count FROM records").get()
            ?.count,
        ).toBe(1);
        expect(
          Buffer.from(
            inspection.prepare("SELECT replay FROM records").get()
              ?.replay as Uint8Array,
          ),
        ).toEqual(originalBytes);
        expect(
          Buffer.from(
            inspection
              .prepare("SELECT replay FROM records_v2 WHERE revision=1")
              .get()?.replay as Uint8Array,
          ),
        ).toEqual(originalBytes);
      } finally {
        inspection.close();
      }
      storage.close();
      storage = new Storage(path);
      expect(storage.rankings(current.replay.config).total).toBe(1);
      expect(storage.rankings(legacy.replay.config).total).toBe(1);
      expect(storage.session("existing-session")).toEqual(user);
    } finally {
      storage?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains stable top-50 personal bests across 1,500 registered players", async () => {
    const directory = await mkdtemp(join(tmpdir(), "velocity-storage-scale-"));
    const storage = new Storage(join(directory, "rankings.sqlite"));
    try {
      const { replay, time, compressed } = verifiedRecording();
      const users: User[] = [];
      for (let index = 0; index < 1_500; index++) {
        // Storage-only fixtures bypass password hashing; HTTP auth is tested separately.
        const user = storage.register(
          `Driver_${index.toString().padStart(4, "0")}`,
          "fixture-password-hash",
          "fixture-recovery-hash",
        );
        users.push(user);
        storage.record(user, replay, time, compressed);
      }
      const inspection = new DatabaseSync(join(directory, "rankings.sqlite"));
      try {
        const plan = inspection
          .prepare(
            `EXPLAIN QUERY PLAN
          SELECT users.username, records_v2.time FROM records_v2
          JOIN users ON users.id=records_v2.user_id
          WHERE course_id=? AND car_id=? AND assist=? AND laps=? AND revision=?
          ORDER BY records_v2.time,records_v2.created_at,records_v2.user_id LIMIT 50`,
          )
          .all(
            replay.config.courseId,
            replay.config.carId,
            replay.config.assist,
            replay.config.laps,
            CURRENT_REVISION,
          );
        expect(
          plan.some((row) => String(row.detail).includes("ranking_board")),
        ).toBe(true);
        expect(
          plan.some((row) => String(row.detail).includes("TEMP B-TREE")),
        ).toBe(false);
      } finally {
        inspection.close();
      }
      const initial = storage.rankings(replay.config);
      const entries = initial.entries as {
        rank: number;
        username: string;
        time: number;
        carId: string;
      }[];
      expect(initial.total).toBe(1_500);
      expect(initial.entries).toHaveLength(50);
      expect(initial.entries.map((entry) => entry.rank)).toEqual(
        Array.from({ length: 50 }, (_, index) => index + 1),
      );
      expect(new Set(entries.map((entry) => entry.username)).size).toBe(50);
      expect(
        entries.every(
          (entry) => entry.time === time && entry.carId === replay.config.carId,
        ),
      ).toBe(true);
      expect(storage.rankings(replay.config)).toEqual(initial);

      // An equal or slower candidate must retain the original verified personal best.
      storage.record(users[0], replay, time, compressed);
      storage.record(users[0], replay, time + 1, compressed);
      expect(storage.rankings(replay.config)).toEqual(initial);
      for (const config of [
        { ...replay.config, carId: "comet" as const },
        { ...replay.config, assist: "balanced" as const },
        { ...replay.config, courseId: "copper" as const },
        { ...replay.config, laps: replay.config.laps + 1 },
        { ...replay.config, revision: 1 as const },
      ]) {
        expect(storage.rankings(config)).toEqual({ entries: [], total: 0 });
      }

      expect(
        storage.createSession(
          "first-session-hash",
          users[0].id,
          "fixture-password-hash",
        ),
      ).toBe(true);
      expect(
        storage.createSession(
          "second-session-hash",
          users[1].id,
          "fixture-password-hash",
        ),
      ).toBe(true);
      storage.revoke("first-session-hash");
      expect(storage.session("first-session-hash")).toBeNull();
      expect(storage.session("second-session-hash")).toEqual(users[1]);
    } finally {
      storage.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
