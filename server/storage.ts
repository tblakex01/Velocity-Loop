import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Replay, RaceConfig } from "../src/game/types";
import { CURRENT_REVISION } from "../src/game/definitions";

export type User = { id: string; username: string };
export type Account = User & { password_hash: string; recovery_hash: string };
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export class Storage {
  private db: DatabaseSync;
  private statements = new Map<string, StatementSync>();
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const version = Number(
        (this.prepare("PRAGMA user_version").get() as { user_version: number })
          .user_version,
      );
      if (version > 2)
        throw new Error("This database requires a newer server version.");
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id, created_at);
      CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS records_v2 (
        user_id TEXT NOT NULL REFERENCES users(id), course_id TEXT NOT NULL, car_id TEXT NOT NULL,
        assist TEXT NOT NULL, laps INTEGER NOT NULL, revision INTEGER NOT NULL CHECK(revision IN (1,2)),
        time REAL NOT NULL CHECK(time > 0),
        created_at TEXT NOT NULL, replay BLOB NOT NULL,
        PRIMARY KEY(user_id,course_id,car_id,assist,laps,revision)
      );
      CREATE INDEX IF NOT EXISTS ranking_board_v2 ON records_v2(course_id,car_id,assist,laps,revision,time,created_at,user_id);`);
      if (version === 1)
        this.db
          .exec(`INSERT INTO records_v2(user_id,course_id,car_id,assist,laps,revision,time,created_at,replay)
        SELECT user_id,course_id,car_id,assist,laps,1,time,created_at,replay FROM records;`);
      this.db.exec("PRAGMA user_version=2; COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
  account(username: string): Account | undefined {
    return this.prepare(
      "SELECT id, username, password_hash, recovery_hash FROM users WHERE username=?",
    ).get(username) as Account | undefined;
  }
  register(username: string, password: string, recovery: string): User {
    const user = { id: randomUUID(), username };
    this.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
      user.id,
      username,
      password,
      recovery,
      Date.now(),
    );
    return user;
  }
  recover(
    id: string,
    previous: string,
    password: string,
    recovery: string,
  ): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.prepare(
        "UPDATE users SET password_hash=?, recovery_hash=? WHERE id=? AND recovery_hash=?",
      ).run(password, recovery, id, previous).changes;
      if (changed) this.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      this.db.exec("COMMIT");
      return Number(changed) === 1;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  session(hash: string): User | null {
    return (
      (this.prepare(
        `SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user_id
      WHERE hash=? AND expires_at>?`,
      ).get(hash, Date.now()) as User | undefined) ?? null
    );
  }
  createSession(hash: string, userId: string, passwordHash: string): boolean {
    const now = Date.now();
    this.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
    this.prepare(
      `DELETE FROM sessions WHERE user_id=? AND hash NOT IN
      (SELECT hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 9)`,
    ).run(userId, userId);
    return (
      Number(
        this.prepare(
          `INSERT INTO sessions SELECT ?, id, ?, ? FROM users WHERE id=? AND password_hash=?`,
        ).run(
          hash,
          now + SESSION_MAX_AGE_SECONDS * 1000,
          now,
          userId,
          passwordHash,
        ).changes,
      ) === 1
    );
  }
  revoke(hash: string) {
    this.prepare("DELETE FROM sessions WHERE hash=?").run(hash);
  }
  private board(config: RaceConfig) {
    return [
      config.courseId,
      config.carId,
      config.assist,
      config.laps,
      config.revision ?? CURRENT_REVISION,
    ];
  }
  rankings(config: RaceConfig) {
    const args = this.board(config);
    const rows = this.prepare(
      `SELECT users.username, records_v2.time, records_v2.car_id AS carId, records_v2.created_at AS createdAt, records_v2.revision
      FROM records_v2 JOIN users ON users.id=records_v2.user_id WHERE course_id=? AND car_id=? AND assist=? AND laps=? AND revision=?
      ORDER BY records_v2.time,records_v2.created_at,records_v2.user_id LIMIT 50`,
    ).all(...args);
    const total = Number(
      (
        this.prepare(
          "SELECT COUNT(*) AS count FROM records_v2 WHERE course_id=? AND car_id=? AND assist=? AND laps=? AND revision=?",
        ).get(...args) as { count: number }
      ).count,
    );
    return { entries: rows.map((row, i) => ({ rank: i + 1, ...row })), total };
  }
  record(user: User, replay: Replay, time: number, compressed: Buffer): number {
    const config = { ...replay.config, revision: replay.config.revision ?? 1 };
    const createdAt = new Date().toISOString();
    this.prepare(
      `INSERT INTO records_v2 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,course_id,car_id,assist,laps,revision)
      DO UPDATE SET time=excluded.time, created_at=excluded.created_at, replay=excluded.replay WHERE excluded.time<records_v2.time`,
    ).run(
      user.id,
      config.courseId,
      config.carId,
      config.assist,
      config.laps,
      config.revision,
      time,
      createdAt,
      compressed,
    );
    const args = this.board(config);
    const best = this.prepare(
      "SELECT time,created_at FROM records_v2 WHERE course_id=? AND car_id=? AND assist=? AND laps=? AND revision=? AND user_id=?",
    ).get(...args, user.id) as { time: number; created_at: string };
    const count = this.prepare(
      `SELECT COUNT(*) AS count FROM records_v2 WHERE course_id=? AND car_id=? AND assist=? AND laps=? AND revision=? AND
      (time<? OR (time=? AND created_at<?) OR (time=? AND created_at=? AND user_id<?))`,
    ).get(
      ...args,
      best.time,
      best.time,
      best.created_at,
      best.time,
      best.created_at,
      user.id,
    ) as { count: number };
    return Number(count.count) + 1;
  }
  close() {
    this.db.close();
  }
}
