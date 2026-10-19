import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, objectBody } from "./errors";
import { Storage, SESSION_MAX_AGE_SECONDS, type User } from "./storage";

const COOKIE = "velocity_session";
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class Auth {
  private hashing = 0;
  constructor(
    private storage: Storage,
    private production: boolean,
  ) {}
  private async derive(password: string, salt: string): Promise<Buffer> {
    if (this.hashing >= 4)
      throw new HttpError(503, "Sign-in is busy. Please try again shortly.");
    this.hashing++;
    try {
      return await new Promise<Buffer>((resolve, reject) =>
        scrypt(password, salt, 32, SCRYPT, (error, key) =>
          error ? reject(error) : resolve(key),
        ),
      );
    } finally {
      this.hashing--;
    }
  }
  private async hash(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${(await this.derive(password, salt)).toString("hex")}`;
  }
  private credentials(raw: unknown) {
    const body = objectBody(raw);
    if (
      typeof body.username !== "string" ||
      !/^[A-Za-z0-9_-]{3,24}$/.test(body.username)
    )
      throw new HttpError(
        400,
        "Use 3–24 letters, numbers, underscores or hyphens for your username.",
      );
    if (
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 128
    )
      throw new HttpError(400, "Your password must contain 12–128 characters.");
    return {
      username: body.username,
      password: body.password,
      recoveryCode: body.recoveryCode,
    };
  }
  private token(request: IncomingMessage) {
    const cookie = request.headers.cookie;
    if (!cookie || cookie.length > 4096) return null;
    const token = cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  user(request: IncomingMessage): User | null {
    const token = this.token(request);
    return token ? this.storage.session(digest(token)) : null;
  }
  private setCookie(response: ServerResponse, token: string, maxAge: number) {
    response.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.production ? "; Secure" : ""}`,
    );
  }
  private signIn(
    request: IncomingMessage,
    response: ServerResponse,
    user: User,
    passwordHash: string,
  ) {
    const token = randomBytes(32).toString("base64url");
    if (!this.storage.createSession(digest(token), user.id, passwordHash))
      throw new HttpError(409, "Your credentials changed. Sign in again.");
    const previous = this.token(request);
    if (previous) this.storage.revoke(digest(previous));
    this.setCookie(response, token, SESSION_MAX_AGE_SECONDS);
  }
  async register(
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ) {
    const { username, password } = this.credentials(body);
    if (this.storage.account(username))
      throw new HttpError(409, "That username is already registered.");
    const passwordHash = await this.hash(password);
    const recoveryCode = randomBytes(24).toString("base64url");
    let user: User;
    try {
      user = this.storage.register(
        username,
        passwordHash,
        digest(recoveryCode),
      );
    } catch (error) {
      if ((error as Error).message.includes("UNIQUE constraint failed"))
        throw new HttpError(409, "That username is already registered.");
      throw error;
    }
    this.signIn(request, response, user, passwordHash);
    return { user, recoveryCode };
  }
  async login(
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ) {
    const { username, password } = this.credentials(body);
    const account = this.storage.account(username);
    const [salt, expected] = account?.password_hash.split(":") ?? [
      "0".repeat(32),
      "0".repeat(64),
    ];
    const actual = (await this.derive(password, salt)).toString("hex");
    if (!account || !safeEqual(actual, expected))
      throw new HttpError(401, "The username or password is incorrect.");
    const user = { id: account.id, username: account.username };
    this.signIn(request, response, user, account.password_hash);
    return { user };
  }
  async recover(
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ) {
    const { username, password, recoveryCode } = this.credentials(body);
    if (
      typeof recoveryCode !== "string" ||
      !/^[A-Za-z0-9_-]{32}$/.test(recoveryCode)
    )
      throw new HttpError(400, "A valid recovery code is required.");
    const account = this.storage.account(username);
    if (!account || !safeEqual(digest(recoveryCode), account.recovery_hash))
      throw new HttpError(401, "The username or recovery code is incorrect.");
    const passwordHash = await this.hash(password);
    const nextRecovery = randomBytes(24).toString("base64url");
    if (
      !this.storage.recover(
        account.id,
        account.recovery_hash,
        passwordHash,
        digest(nextRecovery),
      )
    )
      throw new HttpError(409, "The recovery code was already used.");
    const user = { id: account.id, username: account.username };
    this.signIn(request, response, user, passwordHash);
    return { user, recoveryCode: nextRecovery };
  }
  logout(request: IncomingMessage, response: ServerResponse) {
    const token = this.token(request);
    if (token) this.storage.revoke(digest(token));
    this.setCookie(response, "", 0);
    return {};
  }
}
