import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse, RouteOptions } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Config } from "../../src/config.js";
import { createDatabase, type Database } from "../../src/db/client.js";
import { createLogger } from "../../src/lib/logger.js";
import { hashPassword, parsePasswordHash, verifyPassword } from "../../src/lib/password-hash.js";
import type { PasswordVerifier } from "../../src/modules/admin/auth.service.js";
import type { RetentionService } from "../../src/modules/retention/retention.service.js";
import { LocalDiskStorage } from "../../src/storage/local-disk-storage.js";
import { HttpWorkerClient } from "../../src/worker/worker-client.js";
import { assertMatchesContract } from "./contract.js";
import { workerSuccess } from "./fixtures.js";
import { startWorkerStub, type WorkerStub } from "./worker-stub.js";

export const ADMIN_USERNAME = "owner";
export const ADMIN_PASSWORD = "pen-and-paper-2026";
export const WORKER_TOKEN = "test-worker-token-0123456789abcdefghij";
export const CSRF = { "x-requested-with": "fineline" };

/** One scrypt hash per test run (N=2^17 takes about half a second). */
let adminHash: string | undefined;

export interface Harness {
  app: FastifyInstance;
  db: Database;
  retention: RetentionService;
  worker: WorkerStub;
  storage: LocalDiskStorage;
  storageDir: string;
  config: Config;
  logs: string[];
  routes: RouteOptions[];
  /** Number of scrypt verifications run (SR-011: none for throttled logins). */
  passwordChecks: { count: number };
  now: Date;
  setNow(iso: string | Date): void;
  advance(ms: number): void;
  /** app.inject that also checks the response against docs/api/openapi.yaml. */
  request(
    options: InjectOptions & { url: string; method: string },
    check?: { contract?: boolean },
  ): Promise<LightMyRequestResponse>;
  storedFiles(): Promise<string[]>;
  /** Logs in through the API and returns the session cookie value. */
  login(): Promise<string>;
}

/**
 * Sets up a fresh app per test against the shared test database (reset between tests), a temp
 * STORAGE_DIR, a worker stub and a controllable clock. Use once per test file.
 */
export function useHarness(options: { config?: (c: Config) => Config } = {}): Harness {
  const h = {
    logs: [] as string[],
    routes: [] as RouteOptions[],
    passwordChecks: { count: 0 },
  } as unknown as Harness;
  let pool: ReturnType<typeof createDatabase>["pool"];

  beforeAll(async () => {
    adminHash ??= await hashPassword(ADMIN_PASSWORD);
    const conn = createDatabase(process.env.TEST_DATABASE_URL as string);
    pool = conn.pool;
    h.db = conn.db;
    h.worker = await startWorkerStub(() => workerSuccess());
  });

  afterAll(async () => {
    await h.worker.close();
    await pool.end();
  });

  beforeEach(async () => {
    await h.db.execute(
      sql`truncate orders, drawings, frames, order_number_counters, admin_sessions restart identity cascade`,
    );
    await h.db.execute(sql`update settings set lead_time_working_days = 7 where id = 1`);
    h.storageDir = await mkdtemp(path.join(tmpdir(), "fineline-api-test-"));
    h.storage = new LocalDiskStorage(h.storageDir);
    h.worker.calls.length = 0;
    h.worker.reply = () => workerSuccess();
    h.logs.length = 0;
    h.routes.length = 0;
    h.passwordChecks.count = 0;
    h.now = new Date("2026-11-06T13:00:00Z");
    h.setNow = (iso) => {
      h.now = new Date(iso);
    };
    h.advance = (ms) => {
      h.now = new Date(h.now.getTime() + ms);
    };

    const base: Config = {
      databaseUrl: process.env.TEST_DATABASE_URL as string,
      port: 0,
      storageDir: h.storageDir,
      worker: { url: h.worker.url, token: WORKER_TOKEN, timeoutMs: 5_000, maxConcurrent: 2 },
      admin: { username: ADMIN_USERNAME, passwordHash: parsePasswordHash(adminHash as string)! },
      sessionIdleHours: 8,
      cookieSecure: true,
      corsOrigin: undefined,
      trustProxy: false,
      drawingArea: { widthMm: 180, heightMm: 267 },
      strokeBudget: { maxStrokes: 1500, maxTotalLengthMm: 25_000 },
      retentionSweepIntervalMs: 3_600_000,
      logLevel: "info",
    };
    h.config = options.config ? options.config(base) : base;

    const destination = new Writable({
      write(chunk: Buffer, _enc, done) {
        h.logs.push(chunk.toString("utf8"));
        done();
      },
    });
    const countingVerifier: PasswordVerifier = async (password, hash) => {
      h.passwordChecks.count += 1;
      return verifyPassword(password, hash);
    };
    const built = await buildApp({
      config: h.config,
      db: h.db,
      storage: h.storage,
      worker: new HttpWorkerClient(
        h.config.worker.url,
        h.config.worker.token,
        h.config.worker.timeoutMs,
      ),
      clock: () => new Date(h.now),
      logger: createLogger("info", destination),
      verifyPassword: countingVerifier,
      onRoute: (route) => h.routes.push(route),
    });
    h.app = built.app;
    h.retention = built.retention;
    await h.app.ready();

    h.request = async (opts, check = {}) => {
      const res = await h.app.inject(opts);
      if (check.contract !== false) {
        assertMatchesContract(opts.method, opts.url, {
          statusCode: res.statusCode,
          headers: res.headers,
          body: res.body,
        });
        assertCommonHeaders(opts.method, opts.url, res);
      }
      return res;
    };
    h.storedFiles = async () => listFiles(h.storageDir);
    h.login = async () => {
      const res = await h.request({
        method: "POST",
        url: "/api/v1/admin/session",
        headers: CSRF,
        payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      });
      if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode}`);
      const cookie = res.cookies.find((c) => c.name === "fineline_admin");
      return cookie?.value as string;
    };
  });

  afterEach(async () => {
    await h.app.close();
    await rm(h.storageDir, { recursive: true, force: true });
  });

  return h;
}

/** nosniff everywhere; no-store on admin responses and on POST /drawings and /orders (SR-019). */
function assertCommonHeaders(method: string, url: string, res: LightMyRequestResponse) {
  if (res.headers["x-content-type-options"] !== "nosniff") {
    throw new Error(`${method} ${url}: missing X-Content-Type-Options: nosniff`);
  }
  const needsNoStore =
    url.startsWith("/api/v1/admin/") ||
    (method === "POST" && (url === "/api/v1/drawings" || url === "/api/v1/orders"));
  const cache = String(res.headers["cache-control"] ?? "");
  if (
    needsNoStore &&
    !cache
      .split(",")
      .map((s) => s.trim())
      .includes("no-store")
  ) {
    throw new Error(`${method} ${url}: missing Cache-Control: no-store (got "${cache}")`);
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return out;
  }
  for (const e of entries)
    if (e.isFile()) out.push(path.relative(dir, path.join(e.parentPath, e.name)));
  return out.sort();
}
