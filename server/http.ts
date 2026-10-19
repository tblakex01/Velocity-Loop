import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { isIP } from "node:net";
import {
  ASSISTS,
  CARS,
  COURSES,
  CURRENT_REVISION,
  getCourse,
} from "../src/game/definitions";
import type { RaceConfig } from "../src/game/types";
import { Auth } from "./auth";
import { HttpError, objectBody } from "./errors";
import { Storage } from "./storage";
import { VerificationPool } from "./verification";

const compress = promisify(gzip);
// 36,000 canonical analog frames fit below 128 serialized bytes each; allow envelope headroom.
export const REPLAY_BODY_LIMIT = 6 * 1024 * 1024;
export const AUTH_BODY_LIMIT = 64 * 1024;
const DEFAULT_ORIGINS = [
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4174",
];
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
export type AppOptions = {
  databasePath?: string;
  staticDirectory?: string;
  allowedOrigins?: string[];
  production?: boolean;
  verificationWorkers?: number;
  trustedProxyAddresses?: string[];
};

class RateLimits {
  private buckets = new Map<string, { count: number; expires: number }>();
  take(key: string, limit: number, window: number) {
    const now = Date.now();
    if (this.buckets.size >= 10000) {
      for (const [id, bucket] of this.buckets)
        if (bucket.expires <= now) this.buckets.delete(id);
      if (this.buckets.size >= 10000 && !this.buckets.has(key))
        throw new HttpError(429, "Too many requests. Please try again later.");
    }
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + window };
      this.buckets.set(key, bucket);
    }
    if (++bucket.count > limit)
      throw new HttpError(429, "Too many requests. Please try again later.");
  }
}

async function body(
  request: IncomingMessage,
  limit: number,
): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? ""))
    throw new HttpError(415, "Use application/json.");
  if (Number(request.headers["content-length"]) > limit)
    throw new HttpError(413, "The request is too large.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "The request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return objectBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The request contains malformed JSON.");
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function rankingConfig(url: URL): RaceConfig {
  const courseId = url.searchParams.get("courseId") ?? "";
  const carId = url.searchParams.get("carId") ?? "";
  const assist = url.searchParams.get("assist") ?? "";
  const course = COURSES.find((entry) => entry.id === courseId);
  const car = CARS.find((entry) => entry.id === carId);
  const mode = ASSISTS.find((entry) => entry.id === assist);
  if (!course || !car || !mode)
    throw new HttpError(400, "Choose a valid course, car and assist mode.");
  const revision = url.searchParams.get("revision");
  if (revision !== null && revision !== "1" && revision !== "2")
    throw new HttpError(400, "Choose a valid track revision.");
  const selectedRevision =
    revision === null ? CURRENT_REVISION : revision === "1" ? 1 : 2;
  const selectedCourse = getCourse(course.id, selectedRevision);
  const requestedLaps = url.searchParams.get("laps");
  if (requestedLaps !== null && Number(requestedLaps) !== selectedCourse.laps)
    throw new HttpError(400, "Rankings use the course’s official lap count.");
  return {
    courseId: course.id,
    carId: car.id,
    assist: mode.id,
    laps: selectedCourse.laps,
    revision: selectedRevision,
  };
}

async function staticFile(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
) {
  let pathname: string;
  try {
    pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  const segments = pathname.split("/");
  if (
    pathname.includes("\\") ||
    pathname.includes("\0") ||
    segments.some((part) => part === ".." || part.startsWith("."))
  )
    throw new HttpError(404, "Not found.");
  const root = await realpath(directory).catch(() => {
    throw new HttpError(
      404,
      "Build the game before starting the production server.",
    );
  });
  let file = resolve(root, `.${pathname}`);
  let info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    if (extname(pathname) && pathname !== "/")
      throw new HttpError(404, "Not found.");
    file = resolve(root, "index.html");
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) throw new HttpError(404, "Not found.");
  file = await realpath(file);
  if (!file.startsWith(`${root}${sep}`)) throw new HttpError(404, "Not found.");
  response.setHeader(
    "Content-Type",
    MIME[extname(file)] ?? "application/octet-stream",
  );
  response.setHeader("Content-Length", info.size);
  response.setHeader(
    "Cache-Control",
    /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\./.test(file)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  );
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  await new Promise<void>((done, reject) => {
    const stream = createReadStream(file);
    stream.on("error", reject);
    response.on("close", () => {
      stream.destroy();
      done();
    });
    stream.on("end", done);
    stream.pipe(response);
  });
}

export function createApp(options: AppOptions = {}) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origins = new Set(
    options.allowedOrigins ??
      (process.env.APP_ORIGIN
        ? [process.env.APP_ORIGIN]
        : production
          ? []
          : DEFAULT_ORIGINS),
  );
  if (production && !origins.size)
    throw new Error(
      "APP_ORIGIN is required in production (the public HTTPS game origin).",
    );
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || (production && url.protocol !== "https:"))
      throw new Error(
        "Allowed origins must be exact origins, using HTTPS in production.",
      );
  }
  const trustedProxies = new Set(
    options.trustedProxyAddresses ??
      process.env.TRUSTED_PROXY_ADDRESSES?.split(",")
        .map((address) => address.trim())
        .filter(Boolean) ??
      [],
  );
  for (const address of trustedProxies)
    if (!isIP(address))
      throw new Error("Trusted proxy addresses must be explicit IP addresses.");
  const clientAddress = (request: IncomingMessage) => {
    const peer = request.socket.remoteAddress ?? "unknown";
    const forwarded = request.headers["x-forwarded-for"];
    if (!trustedProxies.has(peer) || typeof forwarded !== "string") return peer;
    const address = forwarded.split(",").at(-1)?.trim() ?? "";
    return isIP(address) ? address : peer;
  };
  const storage = new Storage(
    options.databasePath ?? resolve("data", "velocity.sqlite"),
  );
  const auth = new Auth(storage, production);
  const pool = new VerificationPool(options.verificationWorkers);
  const limits = new RateLimits();
  const directory = options.staticDirectory ?? resolve("dist");
  const server = createServer(
    { maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000 },
    (request, response) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "same-origin");
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      );
      response.setHeader("Cache-Control", "no-store");
      if (production)
        response.setHeader("Strict-Transport-Security", "max-age=31536000");
      void (async () => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) {
          if (!["GET", "HEAD"].includes(request.method ?? ""))
            throw new HttpError(405, "Method not allowed.");
          await staticFile(request, response, directory);
          return;
        }
        const origin = request.headers.origin;
        if (origin && origins.has(origin)) {
          response.setHeader("Access-Control-Allow-Origin", origin);
          response.setHeader("Access-Control-Allow-Credentials", "true");
          response.setHeader("Vary", "Origin");
        }
        const address = clientAddress(request);
        limits.take(`request:${address}`, 240, 60000);
        if (request.method === "OPTIONS") {
          if (!origin || !origins.has(origin))
            throw new HttpError(403, "This origin is not allowed.");
          response.setHeader("Access-Control-Allow-Methods", "GET, POST");
          response.setHeader("Access-Control-Allow-Headers", "Content-Type");
          response.setHeader("Access-Control-Max-Age", "600");
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/session") {
          json(response, 200, { user: auth.user(request) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/rankings") {
          json(response, 200, storage.rankings(rankingConfig(url)));
          return;
        }
        if (request.method !== "POST")
          throw new HttpError(404, "API endpoint not found.");
        if (
          !origin ||
          !origins.has(origin) ||
          request.headers["sec-fetch-site"] === "cross-site"
        )
          throw new HttpError(403, "This origin is not allowed.");
        if (url.pathname === "/api/auth/logout") {
          json(response, 200, auth.logout(request, response));
          return;
        }
        if (
          [
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/recover",
          ].includes(url.pathname)
        ) {
          limits.take(`auth:${address}`, 20, 15 * 60000);
          const input = await body(request, AUTH_BODY_LIMIT);
          if (typeof input.username === "string")
            limits.take(
              `account:${input.username.toLowerCase().slice(0, 24)}`,
              12,
              15 * 60000,
            );
          const action = url.pathname.split("/").at(-1) as
            "register" | "login" | "recover";
          json(
            response,
            action === "register" ? 201 : 200,
            await auth[action](request, response, input),
          );
          return;
        }
        if (url.pathname === "/api/runs") {
          const user = auth.user(request);
          if (!user)
            throw new HttpError(401, "Sign in to submit a verified run.");
          limits.take(`runs:${user.id}`, 12, 60000);
          const input = await body(request, REPLAY_BODY_LIMIT);
          if (!input.replay) throw new HttpError(400, "A replay is required.");
          const { replay, result } = await pool.verify(input.replay);
          if (
            !result.valid ||
            !Number.isFinite(result.time) ||
            result.time <= 0
          )
            throw new HttpError(
              422,
              result.reason ?? "The replay could not be verified.",
            );
          if (
            replay.config.laps !==
            getCourse(replay.config.courseId, replay.config.revision ?? 1).laps
          )
            throw new HttpError(
              422,
              "The replay must use the course’s official lap count.",
            );
          const compressed = await compress(JSON.stringify(replay));
          const currentUser = auth.user(request);
          if (currentUser?.id !== user.id)
            throw new HttpError(401, "Your session expired. Sign in again.");
          const rank = storage.record(user, replay, result.time, compressed);
          json(response, 201, { verified: true, time: result.time, rank });
          return;
        }
        throw new HttpError(404, "API endpoint not found.");
      })().catch((error) => {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 429 || status === 503)
          response.setHeader("Retry-After", "60");
        json(response, status, {
          error:
            error instanceof HttpError
              ? error.message
              : "The server could not complete this request.",
        });
      });
    },
  );
  let closed = false;
  return {
    server,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((done, reject) =>
        server.listening
          ? server.close((error) => (error ? reject(error) : done()))
          : done(),
      );
      await pool.close();
      storage.close();
    },
  };
}
