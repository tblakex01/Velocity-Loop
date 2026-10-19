import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { AUTH_BODY_LIMIT, REPLAY_BODY_LIMIT, createApp } from "../server/http";
import { VerificationPool } from "../server/verification";
import { CURRENT_REVISION, getCourse } from "../src/game/definitions";
import { MAX_RACE_TICKS, createRace, stepRace } from "../src/game/simulation";
import type { Replay, RaceConfig, RaceInput } from "../src/game/types";

const ORIGIN = "http://127.0.0.1:4173";
const PASSWORD = "a-strong-test-password";
const BOARD = "/api/rankings?courseId=ignition&carId=atelier&assist=full";
function replay(revision: 1 | 2 = CURRENT_REVISION): Replay {
  const config: RaceConfig = {
    courseId: "ignition",
    carId: "atelier",
    assist: "full",
    laps: getCourse("ignition", revision).laps,
    revision,
  };
  const state = createRace(config);
  const inputs: RaceInput[] = [];
  while (!state.finished && state.tick < 36000) {
    const input = { throttle: 1, brake: 0, steer: 0, nitro: true };
    inputs.push(input);
    stepRace(state, input, config);
  }
  if (!state.finished) throw new Error("Test race did not finish.");
  return {
    version: 1,
    config,
    inputs,
    finishTime: state.finishTime!,
    createdAt: new Date().toISOString(),
  };
}

describe("persistent first-party race service", () => {
  let directory: string;
  let app: ReturnType<typeof createApp>;
  let base: string;
  const start = async () => {
    app = createApp({
      databasePath: join(directory, "database.sqlite"),
      staticDirectory: join(directory, "dist"),
      allowedOrigins: [ORIGIN],
      verificationWorkers: 1,
    });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "velocity-server-"));
    await mkdir(join(directory, "dist", "assets"), { recursive: true });
    await writeFile(
      join(directory, "dist", "index.html"),
      "<html>Velocity</html>",
    );
    await writeFile(
      join(directory, "dist", "assets", "game-Abcdef12.js"),
      "console.log(1)",
    );
    await writeFile(join(directory, "secret.txt"), "not-public");
    await start();
  });
  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const request = (
    path: string,
    value?: unknown,
    cookie?: string,
    origin = ORIGIN,
  ) =>
    fetch(`${base}${path}`, {
      method: value === undefined ? "GET" : "POST",
      headers: {
        ...(value === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: origin }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
  const register = async (username = "RacerOne") => {
    const response = await request("/api/auth/register", {
      username,
      password: PASSWORD,
    });
    expect(response.status).toBe(201);
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0],
      result: await response.json(),
      response,
    };
  };

  it("creates server sessions, isolates users, logs in and revokes logout cookies", async () => {
    expect(await (await request("/api/session")).json()).toEqual({
      user: null,
    });
    const one = await register();
    expect(one.response.headers.get("set-cookie")).toContain(
      "HttpOnly; SameSite=Strict",
    );
    expect(one.result).toEqual({
      user: { id: expect.any(String), username: "RacerOne" },
      recoveryCode: expect.any(String),
    });
    const two = await register("RacerTwo");
    expect(
      (await (await request("/api/session", undefined, one.cookie)).json())
        .user,
    ).toEqual(one.result.user);
    expect(
      (await (await request("/api/session", undefined, two.cookie)).json())
        .user,
    ).toEqual(two.result.user);
    expect(
      (
        await request("/api/auth/login", {
          username: "racerone",
          password: "incorrect-password",
        })
      ).status,
    ).toBe(401);
    const login = await request("/api/auth/login", {
      username: "racerone",
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    const loginCookie = login.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/api/auth/logout", {}, loginCookie)).status).toBe(
      200,
    );
    expect(
      await (await request("/api/session", undefined, loginCookie)).json(),
    ).toEqual({ user: null });
    expect(
      (await (await request("/api/session", undefined, two.cookie)).json())
        .user,
    ).toEqual(two.result.user);
  });

  it("rotates recovery codes and passwords and invalidates every old session", async () => {
    const { cookie, result } = await register();
    const nextPassword = "a-new-strong-test-password";
    const response = await request("/api/auth/recover", {
      username: "RacerOne",
      recoveryCode: result.recoveryCode,
      password: nextPassword,
    });
    expect(response.status).toBe(200);
    const recovered = await response.json();
    expect(recovered.recoveryCode).not.toBe(result.recoveryCode);
    expect(
      await (await request("/api/session", undefined, cookie)).json(),
    ).toEqual({ user: null });
    expect(
      (
        await request("/api/auth/recover", {
          username: "RacerOne",
          recoveryCode: result.recoveryCode,
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/api/auth/login", {
          username: "RacerOne",
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/api/auth/login", {
          username: "RacerOne",
          password: nextPassword,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await (
          await request(
            "/api/session",
            undefined,
            response.headers.get("set-cookie")!.split(";")[0],
          )
        ).json()
      ).user,
    ).toEqual(result.user);
  });

  it("validates credentials, rejects conflicting usernames and blocks cross-origin writes", async () => {
    expect(
      (
        await request("/api/auth/register", {
          username: "../../x",
          password: PASSWORD,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/auth/register", {
          username: "Okay",
          password: "short",
        })
      ).status,
    ).toBe(400);
    await register();
    expect(
      (
        await request("/api/auth/register", {
          username: "racerone",
          password: PASSWORD,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/api/auth/register",
          { username: "NewUser", password: PASSWORD },
          undefined,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    const missing = await fetch(`${base}/api/auth/logout`, { method: "POST" });
    expect(missing.status).toBe(403);
  });

  it("handles concurrent username registration and expired sessions", async () => {
    const responses = await Promise.all(
      ["SameName", "samename"].map((username) =>
        request("/api/auth/register", { username, password: PASSWORD }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const cookie = responses
      .find((response) => response.status === 201)!
      .headers.get("set-cookie")!
      .split(";")[0];
    const database = new DatabaseSync(join(directory, "database.sqlite"));
    database.exec("UPDATE sessions SET expires_at=0");
    database.close();
    expect(
      await (await request("/api/session", undefined, cookie)).json(),
    ).toEqual({ user: null });
  });

  it("uses Secure production cookies and returns bounded verification backpressure", async () => {
    await app.close();
    app = createApp({
      databasePath: join(directory, "database.sqlite"),
      allowedOrigins: ["https://game.example"],
      production: true,
      verificationWorkers: 1,
      trustedProxyAddresses: ["127.0.0.1"],
    });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const response = await request(
      "/api/auth/register",
      { username: "SecureUser", password: PASSWORD },
      undefined,
      "https://game.example",
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("; Secure");
    for (let index = 1; index <= 21; index++) {
      const client = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: {
          Origin: "https://game.example",
          "Content-Type": "application/json",
          "X-Forwarded-For": `192.0.2.${index}`,
        },
        body: JSON.stringify({ username: `Test${index}`, password: "short" }),
      });
      expect(client.status).toBe(400);
    }
    const pool = new VerificationPool(1);
    try {
      const payload = replay();
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => pool.verify(payload)),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(8);
      const rejected = results.filter((result) => result.status === "rejected");
      expect(rejected).toHaveLength(2);
      expect(
        rejected.every(
          (result) =>
            result.status === "rejected" && result.reason.status === 503,
        ),
      ).toBe(true);
    } finally {
      await pool.close();
    }
  });

  it("limits repeated authentication requests", async () => {
    for (let index = 0; index < 20; index++) {
      const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/json",
          "X-Forwarded-For": `192.0.2.${index + 1}`,
        },
        body: JSON.stringify({ username: `Test${index}`, password: "invalid" }),
      });
      expect(response.status).toBe(400);
    }
    const response = await request("/api/auth/login", {
      username: "Test",
      password: PASSWORD,
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("rejects malformed JSON, excessive bodies and invalid board partitions", async () => {
    const malformed = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: expect.stringContaining("malformed JSON"),
    });
    const large = await request("/api/auth/register", {
      padding: "x".repeat(AUTH_BODY_LIMIT),
    });
    expect(large.status).toBe(413);
    expect(
      (await request("/api/rankings?courseId=bad&carId=atelier&assist=full"))
        .status,
    ).toBe(400);
    expect((await request(`${BOARD}&laps=1`)).status).toBe(400);
    expect(await (await request(BOARD)).json()).toEqual({
      entries: [],
      total: 0,
    });
  });

  it("accepts maximum-length analog input bodies and still enforces the replay byte bound", async () => {
    const { cookie } = await register();
    const analog = {
      throttle: 0.11111111111111112,
      brake: 0.9999999999999999,
      steer: -0.12345678901234568,
      nitro: false,
    };
    const recording = {
      ...replay(),
      inputs: Array(MAX_RACE_TICKS).fill(analog),
      finishTime: 300,
    };
    const bytes = Buffer.byteLength(JSON.stringify({ replay: recording }));
    expect(bytes).toBeGreaterThan(2 * 1024 * 1024);
    expect(bytes).toBeLessThanOrEqual(REPLAY_BODY_LIMIT);
    const response = await request("/api/runs", { replay: recording }, cookie);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Replay does not reach the finish line.",
    });
    expect(
      (
        await request(
          "/api/runs",
          { padding: "x".repeat(REPLAY_BODY_LIMIT) },
          cookie,
        )
      ).status,
    ).toBe(413);
    expect(await (await request(BOARD)).json()).toEqual({
      entries: [],
      total: 0,
    });
  });

  it("verifies genuine races in workers, rejects false times and persists personal-best rankings", async () => {
    const recording = replay();
    expect((await request("/api/runs", { replay: recording })).status).toBe(
      401,
    );
    const { cookie, result } = await register();
    const falseRun = await request(
      "/api/runs",
      { replay: { ...recording, finishTime: 1 } },
      cookie,
    );
    expect(falseRun.status).toBe(422);
    expect(await (await request(BOARD)).json()).toEqual({
      entries: [],
      total: 0,
    });
    const valid = await request("/api/runs", { replay: recording }, cookie);
    expect(valid.status).toBe(201);
    expect(await valid.json()).toEqual({
      verified: true,
      time: recording.finishTime,
      rank: 1,
    });
    expect(
      (await request("/api/runs", { replay: recording }, cookie)).status,
    ).toBe(201);
    const board = await (await request(BOARD)).json();
    expect(board).toEqual({
      entries: [
        {
          rank: 1,
          username: "RacerOne",
          time: recording.finishTime,
          carId: "atelier",
          revision: CURRENT_REVISION,
          createdAt: expect.any(String),
        },
      ],
      total: 1,
    });
    expect(
      await (
        await request("/api/rankings?courseId=ignition&carId=comet&assist=full")
      ).json(),
    ).toEqual({ entries: [], total: 0 });
    await app.close();
    await start();
    expect(await (await request(BOARD)).json()).toEqual(board);
    expect(
      (await (await request("/api/session", undefined, cookie)).json()).user,
    ).toEqual(result.user);
  }, 15000);

  it("accepts unversioned legacy replays and isolates the current ranking revision", async () => {
    const { cookie } = await register();
    const legacy = replay(1);
    const { revision: _revision, ...legacyConfig } = legacy.config;
    const oldRun = await request(
      "/api/runs",
      { replay: { ...legacy, config: legacyConfig } },
      cookie,
    );
    expect(oldRun.status).toBe(201);
    expect(await (await request(BOARD)).json()).toEqual({
      entries: [],
      total: 0,
    });
    const oldBoard = await (await request(`${BOARD}&revision=1`)).json();
    expect(oldBoard.total).toBe(1);
    expect(oldBoard.entries[0]).toMatchObject({
      revision: 1,
      time: legacy.finishTime,
    });
    expect(
      (await request("/api/runs", { replay: replay() }, cookie)).status,
    ).toBe(201);
    const currentBoard = await (await request(BOARD)).json();
    expect(currentBoard.total).toBe(1);
    expect(currentBoard.entries[0].revision).toBe(CURRENT_REVISION);
    expect(await (await request(`${BOARD}&revision=1`)).json()).toEqual(
      oldBoard,
    );
    expect((await request(`${BOARD}&revision=3`)).status).toBe(400);
  });

  it("serves the built app, caches hashed assets and blocks traversal", async () => {
    const home = await request("/");
    expect(await home.text()).toContain("Velocity");
    expect(home.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(
      (await request("/assets/game-Abcdef12.js")).headers.get("cache-control"),
    ).toContain("immutable");
    expect((await request("/%2e%2e%2fsecret.txt")).status).toBe(404);
    expect((await request("/%2egit/config")).status).toBe(404);
    expect((await request("/assets/missing.js")).status).toBe(404);
  });
});
